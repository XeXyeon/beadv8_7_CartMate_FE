import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Button, Heading, Text } from '@astryxdesign/core';
import { ROUTES } from '@/lib/routes';
import SalesPostEditForm from './_components/SalesPostEditForm';

export const metadata: Metadata = { title: '판매글 수정 | TEAMBUY' };

// 요청마다 다른 params는 Suspense 안에서 읽는다. 밖에서 await하면 cacheComponents 프리렌더가 실패한다. (OPS-5)
export default function SellerProductEditPage({ params }: { params: Promise<{ id: string }> }) {
    return (
        <div className="flex flex-col w-full max-w-7xl mx-auto space-y-space-xl">
            <Heading level={1}>판매글 수정</Heading>
            <Suspense>
                <EditForm params={params} />
            </Suspense>
        </div>
    );
}

async function EditForm({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const postId = Number(id);
    // 숫자가 아닌 id면 폼의 조회가 꺼진 채 "불러오는 중"에 머문다. 미리 안내한다
    if (!Number.isInteger(postId) || postId <= 0) {
        return (
            <div className="flex flex-col items-start gap-space-md">
                <Text className="text-error" role="alert">판매글 주소가 올바르지 않습니다.</Text>
                <Button label="목록으로" href={ROUTES.sellerProducts} variant="secondary" />
            </div>
        );
    }
    return <SalesPostEditForm postId={postId} />;
}
