import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@jovie/ui';

export function Default() {
  return (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant='secondary'>Open panel</Button>
      </SheetTrigger>
      <SheetContent side='right'>
        <SheetHeader>
          <SheetTitle>Release details</SheetTitle>
          <SheetDescription>
            Edit metadata, artwork, and the release date for this drop.
          </SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}
