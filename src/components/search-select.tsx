import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from '@/components/ui/command';

export function SearchSelect({ value, options, onChange, placeholder, searchLabel, disabled }: { value: string; options: { id: string; name: string }[]; onChange: (id: string) => void; placeholder: string; searchLabel?: string; disabled?: boolean }) {
 const [open, setOpen] = useState(false);
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-label={placeholder} aria-expanded={open} disabled={disabled} className="w-full justify-between gap-2"><span className="truncate">{options.find(o => o.id === value)?.name ?? placeholder}</span><ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" /></Button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0"><Command><CommandInput placeholder={searchLabel ?? placeholder} aria-label={searchLabel ?? placeholder} /><CommandList><CommandEmpty>—</CommandEmpty>{options.map(o => <CommandItem key={o.id} value={`${o.name} ${o.id}`} onSelect={() => { onChange(o.id); setOpen(false); }}><span className="min-w-0 flex-1 break-words">{o.name}</span>{value === o.id && <Check className="size-4" />}</CommandItem>)}</CommandList></Command></PopoverContent></Popover>;
}