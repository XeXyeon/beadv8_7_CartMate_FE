'use client';

import { useSearchParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import Icon from '@/components/ui/Icon';
import { ROUTES } from '@/lib/routes';

export default function ChargeFailMessage() {
    const message = useSearchParams().get('message') || '결제가 취소되었거나 실패했습니다.';
    return (
        <Card padding={5}>
            <EmptyState
                title="결제하지 못했습니다"
                description={message}
                icon={<Icon name="error" />}
                actions={<Button label="다시 충전하기" href={ROUTES.depositCharge} variant="primary" />}
            />
        </Card>
    );
}
