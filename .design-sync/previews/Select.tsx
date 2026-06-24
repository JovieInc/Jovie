import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';

export function Default() {
  return (
    <div style={{ maxWidth: 240 }}>
      <Select defaultValue='weekly' defaultOpen>
        <SelectTrigger>
          <SelectValue placeholder='Frequency' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='daily'>Daily</SelectItem>
          <SelectItem value='weekly'>Weekly</SelectItem>
          <SelectItem value='monthly'>Monthly</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
