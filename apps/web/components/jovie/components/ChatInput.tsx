'use client';

// @coverage-via apps/web/tests/unit/chat/ChatInput.test.tsx

import { Button } from '@jovie/ui';
import { motion, useReducedMotion } from 'motion/react';
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useRegisterComposerFocus } from '@/components/features/chat/Composer';
import { DictationWaveform } from '@/components/shell/DictationWaveform';
import {
  insertLargeTextAtCaret,
  shouldChunkLargePaste,
} from '@/lib/chat/large-text-paste';
import { serializeEntity, serializeSkill } from '@/lib/chat/tokens';
import {
  joinDictationText,
  type TranscriberErrorCode,
} from '@/lib/chat/transcriber';
import { SYSTEM_B_RADIUS_PX } from '@/lib/design/system-b-radius';
import { useEntityRecents } from '@/lib/queries/useEntityRecents';
import { cn } from '@/lib/utils';
