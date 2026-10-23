CREATE TABLE public.operational_access_secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), property_id uuid NOT NULL REFERENCES public.properties(id), room_id uuid REFERENCES public.rooms(id), kind text NOT NULL CHECK(kind IN('building','door','keybox')), secret_value text NOT NULL, valid_from timestamptz, valid_until timestamptz, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.operational_access_secrets TO service_role;
ALTER TABLE public.operational_access_secrets ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX access_secret_room_kind ON public.operational_access_secrets(organization_id,room_id,kind) WHERE room_id IS NOT NULL;
CREATE UNIQUE INDEX access_secret_property_kind ON public.operational_access_secrets(organization_id,property_id,kind) WHERE room_id IS NULL;
INSERT INTO public.operational_access_secrets(organization_id,property_id,room_id,kind,secret_value) SELECT organization_id,property_id,id,'door',key_code FROM public.rooms WHERE nullif(trim(key_code),'') IS NOT NULL;
UPDATE public.rooms SET key_code=NULL WHERE key_code IS NOT NULL;
COMMENT ON COLUMN public.rooms.key_code IS 'DEPRECATED: operational_access_secrets with scoped reveal; must remain NULL.';
CREATE OR REPLACE FUNCTION public.block_legacy_key_code() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.key_code IS NOT NULL THEN RAISE EXCEPTION 'use_access_secret'; END IF; RETURN NEW; END $$;
CREATE TRIGGER block_legacy_key_code BEFORE INSERT OR UPDATE OF key_code ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.block_legacy_key_code();
CREATE OR REPLACE FUNCTION public.access_secret_authorized(_property uuid,_room uuid,_edit boolean) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE org uuid; BEGIN
 SELECT organization_id INTO org FROM public.properties WHERE id=_property;
 IF auth.uid() IS NULL OR org IS NULL OR org IS DISTINCT FROM public.active_organization_id() OR NOT public.is_organization_member(org) OR NOT public.can_access_property(_property) OR NOT public.has_organization_permission(org,CASE WHEN _edit THEN 'edit_access_codes' ELSE 'view_access_codes' END) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _room IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.rooms WHERE id=_room AND property_id=_property AND organization_id=org) THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN org;
END $$;
REVOKE ALL ON FUNCTION public.access_secret_authorized(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.list_access_secret_metadata(_property uuid,_room uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE org uuid; result jsonb; BEGIN
 org:=public.access_secret_authorized(_property,_room,false);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'valid_from',valid_from,'valid_until',valid_until,'updated_at',updated_at)),'[]'::jsonb) INTO result FROM public.operational_access_secrets WHERE organization_id=org AND property_id=_property AND room_id IS NOT DISTINCT FROM _room;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.reveal_access_secret(_property uuid,_room uuid,_kind text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE org uuid; item record; BEGIN
 org:=public.access_secret_authorized(_property,_room,false);
 SELECT * INTO item FROM public.operational_access_secrets WHERE organization_id=org AND property_id=_property AND room_id IS NOT DISTINCT FROM _room AND kind=_kind;
 IF item.id IS NULL THEN RETURN NULL; END IF;
 IF (item.valid_from IS NOT NULL AND item.valid_from>now()) OR (item.valid_until IS NOT NULL AND item.valid_until<=now()) THEN RAISE EXCEPTION 'access_code_expired'; END IF;
 INSERT INTO public.audit_logs(organization_id,actor_id,entity,entity_id,action,metadata) VALUES(org,auth.uid(),'access_secret',item.id::text,'revealed',jsonb_build_object('kind',_kind,'property_id',_property,'room_id',_room));
 RETURN item.secret_value;
END $$;
CREATE OR REPLACE FUNCTION public.save_access_secret(_property uuid,_room uuid,_kind text,_value text,_from timestamptz DEFAULT NULL,_until timestamptz DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE org uuid; item uuid; BEGIN
 org:=public.access_secret_authorized(_property,_room,true);
 IF _kind IS NULL OR _kind NOT IN('building','door','keybox') OR _value IS NULL OR length(trim(_value))<1 OR length(_value)>500 OR (_from IS NOT NULL AND _until IS NOT NULL AND _until<=_from) THEN RAISE EXCEPTION 'invalid_access_secret'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(org::text||_property::text||coalesce(_room::text,'property')||_kind));
 SELECT id INTO item FROM public.operational_access_secrets WHERE organization_id=org AND property_id=_property AND room_id IS NOT DISTINCT FROM _room AND kind=_kind FOR UPDATE;
 IF item IS NULL THEN INSERT INTO public.operational_access_secrets(organization_id,property_id,room_id,kind,secret_value,valid_from,valid_until,updated_by) VALUES(org,_property,_room,_kind,trim(_value),_from,_until,auth.uid()) RETURNING id INTO item;
 ELSE UPDATE public.operational_access_secrets SET secret_value=trim(_value),valid_from=_from,valid_until=_until,updated_by=auth.uid(),updated_at=now() WHERE id=item; END IF;
 INSERT INTO public.audit_logs(organization_id,actor_id,entity,entity_id,action,metadata) VALUES(org,auth.uid(),'access_secret',item::text,'changed',jsonb_build_object('kind',_kind,'property_id',_property,'room_id',_room));
END $$;
REVOKE ALL ON FUNCTION public.list_access_secret_metadata(uuid,uuid),public.reveal_access_secret(uuid,uuid,text),public.save_access_secret(uuid,uuid,text,text,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_access_secret_metadata(uuid,uuid),public.reveal_access_secret(uuid,uuid,text),public.save_access_secret(uuid,uuid,text,text,timestamptz,timestamptz) TO authenticated;