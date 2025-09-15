'use client';

import { Button, Sheet, SheetContent, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@jovie/ui';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { PanelLeft } from 'lucide-react';
import React from 'react';
import { Divider } from '@/components/atoms/Divider';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const SIDEBAR_COOKIE_NAME = 'sidebar:state';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

... (rest of file content preserved) ...
