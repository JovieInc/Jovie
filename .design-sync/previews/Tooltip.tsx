import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';

export function Default() {
  return (
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant='secondary'>Save</Button>
        </TooltipTrigger>
        <TooltipContent>Save changes</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
