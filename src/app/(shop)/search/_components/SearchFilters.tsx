'use client';

import Icon from '@/components/ui/Icon';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';

// 검색 필터 영역. BE 검색이 제목 조건만 지원해서 화면 구성만 남겨 두고 모두 비활성이다. (로드맵 SHOP-3, 이슈 SHOP-3#1)
const FILTER_GROUPS = [
    { title: '종목', items: ['축구', '풋살', '야구', '농구', '러닝'] },
    { title: '카테고리', items: ['유니폼 / 의류', '축구화', '축구공', '신가드 / 보호대'] },
];

const PRICE_RANGES = ['3만원 이하', '3만원 ~ 5만원', '5만원 ~ 10만원', '10만원 이상'];

const SORT_OPTIONS = [
    { value: 'latest', label: '최신순' },
    { value: 'popular', label: '공동구매 인기순' },
    { value: 'price-asc', label: '낮은 가격순' },
    { value: 'price-desc', label: '높은 가격순' },
];

const PREPARING = '필터는 준비 중입니다';
const noop = () => {};

export function SearchFilters() {
    return (
        <aside className="hidden w-[240px] shrink-0 lg:block" aria-label="검색 필터 (준비 중)">
            <Card padding={4} className="flex flex-col gap-space-lg">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 font-label-md text-label-md text-on-surface">
                        <Icon name="tune" className="text-[18px]" />
                        필터 옵션
                    </div>
                    <Text type="supporting" color="secondary">준비 중</Text>
                </div>
                {FILTER_GROUPS.map((group) => (
                    <CheckboxList key={group.title} label={group.title} value={[]} density="compact" isDisabled disabledMessage={PREPARING}>
                        {group.items.map((item) => (
                            <CheckboxListItem key={item} value={item} label={item} />
                        ))}
                    </CheckboxList>
                ))}
                <RadioList label="가격대" value="" onChange={noop} size="sm" isDisabled disabledMessage={PREPARING}>
                    {PRICE_RANGES.map((range) => (
                        <RadioListItem key={range} value={range} label={range} />
                    ))}
                </RadioList>
                <Button label="필터 적용" variant="primary" width="100%" isDisabled tooltip={PREPARING} />
            </Card>
        </aside>
    );
}

export function SearchSortBar() {
    return (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 sm:px-4">
            <span className="lg:hidden">
                <Button label="필터 · 준비 중" variant="secondary" size="sm" icon={<Icon name="tune" />} isDisabled tooltip={PREPARING} />
            </span>
            <Selector
                label="정렬"
                isLabelHidden
                options={SORT_OPTIONS}
                value="latest"
                size="sm"
                width={160}
                isDisabled
                disabledMessage="다른 정렬은 준비 중입니다"
            />
            <span className="hidden lg:inline"><Text type="supporting" color="secondary">정렬 변경은 준비 중입니다</Text></span>
        </div>
    );
}
