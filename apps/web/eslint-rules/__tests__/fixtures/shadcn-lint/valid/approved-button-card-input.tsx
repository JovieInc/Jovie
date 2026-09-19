import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@jovie/ui';

export function ApprovedCanonicalUsage() {
  return (
    <Card className='mt-4 w-full md:w-full'>
      <CardHeader className='mt-2'>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col'>
        <Input variant='default' size='md' className='w-full' />
        <Button variant='primary' size='md' className='mt-2'>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
