'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Header } from '@/components/site/Header';
import { cn } from '@/lib/utils';

export interface MarketingHeaderProps {
    logoSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    scrollThresholdPx?: number;
}

export function MarketingHeader({
    logoSize = 'xs',
    scrollThresholdPx = 8,
}: MarketingHeaderProps) {
    const pathname = usePathname();
    const [isScrolled, setIsScrolled] = useState<boolean>(false);

    const getScrollTop = (): number => {
        if (typeof window === 'undefined') return 0;

        const scrollingElement = document.scrollingElement;
        return (
            window.scrollY ||
            scrollingElement?.scrollTop ||
            document.documentElement.scrollTop ||
            document.body.scrollTop ||
            0
        );
    };

    useLayoutEffect(() => {
        setIsScrolled(getScrollTop() > scrollThresholdPx);
    }, [pathname, scrollThresholdPx]);

    useEffect(() => {
        const scrollTarget = document.scrollingElement ?? document;

        const onScroll = () => {
            setIsScrolled(getScrollTop() > scrollThresholdPx);
        };

        scrollTarget.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            scrollTarget.removeEventListener('scroll', onScroll);
            window.removeEventListener('scroll', onScroll);
        };
    }, [scrollThresholdPx]);

    const showSolid = isScrolled;

    return (
        <Header
            sticky={false}
            logoSize={logoSize}
            className={cn(
                'transition-colors duration-300 border-b',
                showSolid
                    ? 'bg-white/90 dark:bg-black/90 border-subtle backdrop-blur'
                    : 'bg-transparent dark:bg-transparent border-transparent'
            )}
        />
    );
}
