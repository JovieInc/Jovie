import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@jovie/ui';

export function Default() {
  return (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant='secondary'>Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete release?</DialogTitle>
          <DialogDescription>
            This permanently removes the release and its analytics. This
            can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='ghost'>Cancel</Button>
          </DialogClose>
          <Button variant='destructive'>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
