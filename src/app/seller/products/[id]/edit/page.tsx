import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Heading } from '@astryxdesign/core';
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
    return <SalesPostEditForm postId={Number(id)} />;
}
