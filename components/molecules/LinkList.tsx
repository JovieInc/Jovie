'use client';

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as React from 'react';
import { LinkItem, type LinkItemData } from '@/components/atoms/LinkItem';

interface SortableLinkItemProps {
  link: LinkItemData;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}

function SortableLinkItem({
  link,
  onEdit,
  onDelete,
  onToggleVisibility,
}: SortableLinkItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LinkItem
        link={link}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleVisibility={onToggleVisibility}
        isDragging={isDragging}
      />
    </div>
  );
}

interface LinkListProps {
  links: LinkItemData[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onReorder: (links: LinkItemData[]) => void;
  emptyMessage?: string;
  className?: string;
}

export function LinkList({
  links,
  onEdit,
  onDelete,
  onToggleVisibility,
  onReorder,
  emptyMessage = 'No links found. Add your first link to get started.',
  className,
}: LinkListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = links.findIndex(link => link.id === active.id);
      const newIndex = links.findIndex(link => link.id === over.id);

      const newLinks = [...links];
      const [movedLink] = newLinks.splice(oldIndex, 1);
      newLinks.splice(newIndex, 0, movedLink);

      onReorder(newLinks);
    }
  };

  if (links.length === 0) {
    return (
      <div className='text-center py-8'>
        <p className='text-muted-foreground'>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext
          items={links.map(link => link.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className='space-y-3'>
            {links.map(link => (
              <SortableLinkItem
                key={link.id}
                link={link}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleVisibility={onToggleVisibility}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
