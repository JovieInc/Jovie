import type { DemoAssignee } from './demo-types';

export function DemoAvatar({
  assignee,
  size = 20,
}: {
  readonly assignee: DemoAssignee;
  readonly size?: number;
}) {
  return (
    <div
      className='inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white'
      style={{
        width: size,
        height: size,
        backgroundColor: assignee.color,
      }}
      title={assignee.name}
    >
      {assignee.initials}
    </div>
  );
}
