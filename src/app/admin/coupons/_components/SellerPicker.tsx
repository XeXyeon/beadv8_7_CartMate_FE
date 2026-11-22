'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { Button } from '@astryxdesign/core';
import { useGetAdminSalesPosts } from '@/api/generated/admin-sales-post-controller/admin-sales-post-controller';
import { errorMessage } from '@/api/http';

export type PickedSeller = { id: number; name?: string };

type SellerRow = { id: number; name?: string; posts: number; sampleTitle?: string };

// 한 번에 훑는 판매글 수. 같은 판매자의 글은 한 줄로 묶는다.
const POST_PAGE_SIZE = 50;

// 판매자 쿠폰의 판매자 고르기.
// 쿠폰 할인 대상은 판매자 번호(seller.id)로 비교하는데, 관리자 회원 검색은 회원 번호만 준다(둘은 다른 값).
// 판매자 번호를 주는 관리자 API는 판매글 목록뿐이라, 판매글 제목으로 찾아 그 판매자를 고른다.
// 판매글이 없는 판매자는 고를 수 없다(쿠폰을 쓸 상품도 없다).
export default function SellerPicker({ value, onChange }: { value: PickedSeller | null; onChange: (seller: PickedSeller | null) => void }) {
    const [input, setInput] = useState('');
    const [keyword, setKeyword] = useState<string | null>(null);

    const search = useGetAdminSalesPosts(
        { keyword: keyword || undefined, page: 0, size: POST_PAGE_SIZE },
        { query: { enabled: keyword !== null, staleTime: 0 } },
    );
    const posts = search.data?.data?.content;

    const sellers = useMemo(() => {
        const map = new Map<number, SellerRow>();
        for (const p of posts ?? []) {
            if (p.sellerId === undefined) continue;
            const row = map.get(p.sellerId);
            if (row) row.posts += 1;
            else map.set(p.sellerId, { id: p.sellerId, name: p.sellerName, posts: 1, sampleTitle: p.title });
        }
        return [...map.values()];
    }, [posts]);

    const submit = () => setKeyword(input.trim());
    // 바깥 폼(쿠폰 만들기)이 Enter로 제출되지 않게 막고 검색만 한다
    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        }
    };

    if (value) {
        return (
            <div className="flex flex-wrap items-center gap-space-sm font-body-sm text-body-sm">
                <span className="text-on-surface font-semibold">{value.name ?? '이름 없는 판매자'}</span>
                <span className="text-secondary">판매자 #{value.id}</span>
                <Button label="다시 고르기" type="button" variant="secondary" size="sm" onClick={() => onChange(null)} />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-space-xs">
            <div className="flex flex-wrap gap-space-xs">
                <input
                    aria-label="판매글 제목으로 판매자 찾기"
                    className="h-9 min-w-0 flex-1 px-space-sm border border-outline-variant rounded bg-surface-container-lowest font-body-sm text-body-sm outline-none focus:border-primary"
                    placeholder="판매글 제목 (비우면 최근 판매글)"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                />
                <Button label="판매자 찾기" type="button" variant="secondary" size="sm" onClick={submit} />
            </div>
            <p className="font-caption text-caption text-secondary">판매글 제목으로 찾아 그 글의 판매자를 고릅니다. 판매글이 없는 판매자는 고를 수 없습니다.</p>
            {keyword !== null &&
                (search.isPending ? (
                    <p className="font-caption text-caption text-secondary">찾는 중…</p>
                ) : search.isError ? (
                    <p className="font-caption text-caption text-error" role="alert">{errorMessage(search.error, '판매자를 찾지 못했습니다.')}</p>
                ) : sellers.length === 0 ? (
                    <p className="font-caption text-caption text-secondary">조건에 맞는 판매글이 없습니다.</p>
                ) : (
                    <ul className="flex flex-col border border-outline-variant divide-y divide-outline-variant">
                        {sellers.map((s) => (
                            <li key={s.id}>
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between gap-space-sm px-space-sm py-space-xs text-left font-body-sm text-body-sm hover:bg-surface-container-low"
                                    onClick={() => onChange({ id: s.id, name: s.name })}
                                >
                                    <span className="min-w-0">
                                        <span className="text-on-surface font-semibold">{s.name ?? '이름 없는 판매자'}</span>
                                        <span className="block truncate font-caption text-caption text-secondary">
                                            {s.sampleTitle}
                                            {s.posts > 1 ? ` 외 ${s.posts - 1}개` : ''}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-secondary">판매자 #{s.id}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                ))}
            {(search.data?.data?.totalElements ?? 0) > (posts?.length ?? 0) && (
                <p className="font-caption text-caption text-secondary">판매글이 많아 최근 {posts?.length}개만 살폈습니다. 찾는 판매자가 없으면 제목을 더 자세히 입력해 주세요.</p>
            )}
        </div>
    );
}
