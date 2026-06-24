import {
  Button,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui';

export function Default() {
  return (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant='secondary'>Rename</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Label htmlFor='pop-name'>Playlist name</Label>
          <Input id='pop-name' defaultValue='Summer 2026' />
        </div>
      </PopoverContent>
    </Popover>
  );
}
