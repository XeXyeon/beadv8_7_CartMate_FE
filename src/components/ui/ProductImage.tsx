'use client';

import { useState } from 'react';
import Image from 'next/image';
import Icon from '@/components/ui/Icon';

type Props = {
    src: string | null | undefined;
    alt: string;
    className: string;
    iconClassName?: string;
    // 첫 화면의 대표 이미지처럼 바로 보여야 하는 이미지. lazy 대신 즉시 · 높은 우선순위로 받는다
    eager?: boolean;
};

export default function ProductImage({ src, alt, className, iconClassName = 'text-[32px]', eager = false }: Props) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);

    if (!src || failedSrc === src) {
        return <Icon name="image" className={`text-outline ${iconClassName}`} />;
    }

    return (
        <Image
            src={src}
            alt={alt}
            fill
            unoptimized
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : 'auto'}
            className={className}
            onError={() => setFailedSrc(src)}
        />
    );
}
