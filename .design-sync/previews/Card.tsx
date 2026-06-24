import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@jovie/ui';

export function Default() {
  return (
    <Card style={{ maxWidth: 360 }}>
      <CardHeader>
        <CardTitle>Monthly listeners</CardTitle>
        <CardDescription>Your reach across every platform.</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ fontSize: 32, fontWeight: 600 }}>1,284,920</div>
      </CardContent>
    </Card>
  );
}

export function WithFooter() {
  return (
    <Card style={{ maxWidth: 360 }}>
      <CardHeader>
        <CardTitle>Connect Spotify</CardTitle>
        <CardDescription>
          Link your artist profile to sync releases automatically.
        </CardDescription>
      </CardHeader>
      <CardFooter style={{ gap: 8 }}>
        <Button>Connect</Button>
        <Button variant='ghost'>Not now</Button>
      </CardFooter>
    </Card>
  );
}

export function Plain() {
  return (
    <Card style={{ maxWidth: 360 }}>
      <CardContent>
        <p style={{ margin: 0 }}>
          A simple card with just content and no header chrome.
        </p>
      </CardContent>
    </Card>
  );
}
