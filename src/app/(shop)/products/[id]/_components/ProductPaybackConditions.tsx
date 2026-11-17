'use client';

import type { PaybackConditionResponse } from '@/api/generated/model';
import { useGetProductPaybackConditions } from '@/api/generated/payback-condition-controller/payback-condition-controller';
import { errorMessage } from '@/api/http';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';

const funderLabels = { ADMIN: '플랫폼 부담', SELLER: '판매자 부담' } as const;

// 두 조건이 함께 있을 때 어떻게 적용하는지. 뜻은 BE overlapPolicy 그대로, 문장만 짧게.
const policyDescriptions = {
    BOTH: '기준을 채운 조건을 모두 적용합니다.',
    LARGER: '기준을 채운 조건 중 개당 금액이 큰 하나만 적용합니다. 같으면 플랫폼 부담 조건을 적용합니다.',
    ADMIN_ONLY: '플랫폼 부담 조건만 적용합니다.',
    SELLER_ONLY: '판매자 부담 조건만 적용합니다.',
} as const;

function validCondition(condition: PaybackConditionResponse, productId: number) {
    return (condition.productId === undefined || condition.productId === productId)
        && (condition.funder === 'ADMIN' || condition.funder === 'SELLER')
        && Number.isInteger(condition.minQuantity) && (condition.minQuantity ?? 0) > 0
        && Number.isInteger(condition.amountPerUnit) && (condition.amountPerUnit ?? 0) > 0;
}

export default function ProductPaybackConditions({ productId }: { productId: number }) {
    const query = useGetProductPaybackConditions(productId);
    const conditions = query.data?.data;
    const invalid = query.isSuccess && (!Array.isArray(conditions) || conditions.some((condition) => !validCondition(condition, productId)));
    const ordered = Array.isArray(conditions)
        ? [...conditions].sort((a, b) => (a.funder === 'ADMIN' ? 0 : 1) - (b.funder === 'ADMIN' ? 0 : 1))
        : [];
    const hasBoth = ordered.some((condition) => condition.funder === 'ADMIN')
        && ordered.some((condition) => condition.funder === 'SELLER');
    const policy = ordered.find((condition) => condition.funder === 'ADMIN')?.overlapPolicy ?? 'BOTH';

    return (
        <section aria-label="페이백 조건">
            <Card variant="muted">
            <Heading level={2}>페이백 조건</Heading>
            {query.isPending ? (
                <Text display="block" color="secondary" className="mt-3" role="status">조건을 불러오는 중입니다.</Text>
            ) : query.isError || invalid ? (
                <div className="mt-3 flex flex-col items-start gap-3" role="alert">
                    <p className="font-body-sm text-body-sm text-error">
                        {invalid ? '페이백 조건을 표시할 수 없습니다.' : errorMessage(query.error, '페이백 조건을 불러오지 못했습니다.')}
                    </p>
                    <Button label="다시 시도" size="sm" onClick={() => query.refetch()} />
                </div>
            ) : ordered.length === 0 ? (
                <Text display="block" color="secondary" className="mt-3">현재 설정된 페이백 조건이 없습니다.</Text>
            ) : (
                <>
                    <ul className="mt-3 flex flex-col gap-2">
                        {ordered.map((condition) => (
                            <li key={condition.funder} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <Text weight="bold" hasTabularNumbers>1개당 {condition.amountPerUnit!.toLocaleString('ko-KR')}원</Text>
                                    <Badge label={funderLabels[condition.funder!]} variant={condition.funder === 'ADMIN' ? 'blue' : 'teal'} />
                                </div>
                                <Text display="block" type="supporting" color="secondary" className="mt-1">
                                    공동구매에서 이 상품이 {condition.minQuantity!.toLocaleString('ko-KR')}개 이상 구매확정되면 내 구매확정 수량만큼
                                </Text>
                            </li>
                        ))}
                    </ul>
                    {hasBoth && (
                        <Text display="block" color="secondary" className="mt-3">
                            두 조건이 겹치면 {policy in policyDescriptions
                                ? policyDescriptions[policy]
                                : '적용 방식은 현재 확인할 수 없습니다.'}
                        </Text>
                    )}
                </>
            )}
            <p className="mt-3 font-caption text-caption text-secondary">
                조건은 상품이 공동구매에 처음 담길 때 정해져, 이후 바뀐 조건과 다를 수 있습니다.
            </p>
            </Card>
        </section>
    );
}
