import { Button, Card, Input } from '@jovie/ui';

export function ForbiddenAppearanceOverrides() {
  return (
    <>
      <Button className='p-8 bg-pink-500 text-lg rounded-none h-16'>
        Restyle Button
      </Button>
      <Card className='p-0 bg-red-500 rounded-sm text-xl'>Restyle Card</Card>
      <Input className='h-20 px-10 text-2xl rounded-none bg-yellow-300' />
    </>
  );
}
