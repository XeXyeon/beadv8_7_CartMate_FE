import type { Metadata } from 'next';
import { Heading } from '@astryxdesign/core';
import SalesPostEditForm from './_components/SalesPostEditForm';

export const metadata: Metadata = { title: '판매글 수정 | TEAMBUY' };

export default async function SellerProductEditPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <div className="flex flex-col w-full max-w-7xl mx-auto space-y-space-xl">
            <Heading level={1}>판매글 수정</Heading>
            <SalesPostEditForm postId={Number(id)} />
        </div>
    );
}
