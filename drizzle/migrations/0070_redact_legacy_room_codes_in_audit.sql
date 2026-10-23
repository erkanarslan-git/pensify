CREATE OR REPLACE FUNCTION public.write_audit_log() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid(); v_email text; v_id text; v_diff jsonb; v_org uuid; v_row jsonb; before_row jsonb; after_row jsonb;
BEGIN
 v_row:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 v_org:=coalesce(nullif(v_row->>'organization_id','')::uuid,public.default_organization_id());
 IF v_org IS NULL THEN RETURN coalesce(NEW,OLD); END IF;
 BEGIN SELECT email INTO v_email FROM auth.users WHERE id=v_actor; EXCEPTION WHEN OTHERS THEN v_email:=NULL; END;
 v_id:=coalesce(v_row->>'id','');
 IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME='rooms' THEN before_row:=before_row-'key_code'; after_row:=after_row-'key_code'; END IF;
 v_diff:=CASE WHEN TG_OP='DELETE' THEN jsonb_build_object('old',before_row) WHEN TG_OP='INSERT' THEN jsonb_build_object('new',after_row) ELSE jsonb_build_object('old',before_row,'new',after_row) END;
 INSERT INTO public.audit_logs(organization_id,actor_id,actor_email,entity,entity_id,action,diff) VALUES(v_org,v_actor,v_email,TG_TABLE_NAME,v_id,TG_OP,v_diff);
 RETURN coalesce(NEW,OLD);
END $$;