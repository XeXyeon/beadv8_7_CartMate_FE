'use client';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { useProductCategories } from '@/api/productCategories';
import Icon from '@/components/ui/Icon';
import { PRICE_RANGES, effectiveSort, hasFilters, type PriceValue, type SearchState, type SortValue } from '../_lib/searchParams';

// 종목은 BE 검색 조건에 없어 비활성으로 남긴다.
const SPORTS = ['축구', '풋살', '야구', '농구', '러닝'];
const PRICE_ALL = 'all';

// 바꾼 조건은 곧바로 URL에 반영되어 다시 검색한다(적용 버튼 없음). 조건이 바뀌면 첫 페이지로 돌아간다.
export type ChangeSearch = (patch: Partial<Omit<SearchState, 'page' | 'keyword'>>) => void;

type FilterProps = { state: SearchState; onChange: ChangeSearch };

function FilterFields({ state, onChange }: FilterProps) {
    const { categories, isLoading, error } = useProductCategories();

    return (
        <>
            {error ? (
                <Text type="supporting" color="secondary">카테고리 목록을 불러오지 못했습니다.</Text>
            ) : (
                <CheckboxList
                    label="카테고리"
                    value={state.categoryIds.map(String)}
                    onChange={(values) => onChange({ categoryIds: values.map(Number).sort((a, b) => a - b) })}
                    density="compact"
                    isDisabled={isLoading}
                >
                    {categories.map((category) => (
                        <CheckboxListItem key={category.categoryId} value={String(category.categoryId)} label={category.name} />
                    ))}
                </CheckboxList>
            )}
            <RadioList
                label="가격대"
                value={state.price ?? PRICE_ALL}
                onChange={(value) => onChange({ price: value === PRICE_ALL ? null : (value as PriceValue) })}
                size="sm"
            >
                <RadioListItem value={PRICE_ALL} label="전체" />
                {PRICE_RANGES.map((range) => (
                    <RadioListItem key={range.value} value={range.value} label={range.label} />
                ))}
            </RadioList>
            <CheckboxList label="종목" value={[]} density="compact" isDisabled disabledMessage="종목 필터는 준비 중입니다">
                {SPORTS.map((sport) => (
                    <CheckboxListItem key={sport} value={sport} label={sport} />
                ))}
            </CheckboxList>
        </>
    );
}

function ResetButton({ state, onChange, width }: FilterProps & { width?: '100%' }) {
    return (
        <Button
            label="필터 초기화"
            variant="secondary"
            size="sm"
            width={width}
            isDisabled={!hasFilters(state)}
            onClick={() => onChange({ categoryIds: [], price: null })}
        />
    );
}

export function SearchFilters(props: FilterProps) {
    return (
        <aside className="hidden w-[240px] shrink-0 lg:block" aria-label="검색 필터">
            <Card padding={4} className="flex flex-col gap-space-lg">
                <div className="flex items-center gap-1 font-label-md text-label-md text-on-surface">
                    <Icon name="tune" className="text-[18px]" />
                    필터 옵션
                </div>
                <FilterFields {...props} />
                <ResetButton {...props} width="100%" />
            </Card>
        </aside>
    );
}

function filterCount(state: SearchState): number {
    return state.categoryIds.length + (state.price ? 1 : 0);
}

const SORT_LABELS: Record<SortValue, string> = {
    relevance: '관련도순',
    latest: '최신순',
    'price-asc': '낮은 가격순',
    'price-desc': '높은 가격순',
};

export function SearchSortBar({ state, onChange }: FilterProps) {
    const [isFilterOpen, setFilterOpen] = useState(false);
    const count = filterCount(state);

    // 관련도순은 검색어가 있을 때만 고를 수 있다. 공동구매 인기순은 BE 검색이 지원하지 않아 비활성이다
    const options = [
        ...(state.keyword ? [{ value: 'relevance', label: SORT_LABELS.relevance }] : []),
        { value: 'latest', label: SORT_LABELS.latest },
        { value: 'popular', label: '공동구매 인기순 (준비 중)', disabled: true },
        { value: 'price-asc', label: SORT_LABELS['price-asc'] },
        { value: 'price-desc', label: SORT_LABELS['price-desc'] },
    ];

    return (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 sm:px-4">
            <span className="lg:hidden">
                <Button
                    label={count > 0 ? `필터 ${count}` : '필터'}
                    variant="secondary"
                    size="sm"
                    icon={<Icon name="tune" />}
                    onClick={() => setFilterOpen(true)}
                />
            </span>
            <Selector
                label="정렬"
                isLabelHidden
                options={options}
                value={effectiveSort(state)}
                onChange={(value) => onChange({ sort: value as SortValue })}
                size="sm"
                width={180}
            />
            <Drawer isOpen={isFilterOpen} onOpenChange={setFilterOpen} label="검색 필터" side="start" width={320} experimental={{ isFullWidthOnMobile: true }}>
                <Layout
                    header={<DrawerHeader title="필터 옵션" onOpenChange={setFilterOpen} />}
                    content={
                        <LayoutContent>
                            <div className="flex flex-col gap-space-lg">
                                <FilterFields state={state} onChange={onChange} />
                                <div className="flex gap-2">
                                    <ResetButton state={state} onChange={onChange} />
                                    <Button label="결과 보기" variant="primary" size="sm" onClick={() => setFilterOpen(false)} />
                                </div>
                            </div>
                        </LayoutContent>
                    }
                />
            </Drawer>
        </div>
    );
}
