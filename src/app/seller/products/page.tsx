import type { Metadata } from 'next';
import { Button, Heading, Text } from '@astryxdesign/core';
import { ROUTES } from '@/lib/routes';
import SellerPostList from './_components/SellerPostList';

export const metadata: Metadata = { title: '판매글 관리 | TEAMBUY' };

export default function SellerProductsPage() {
    return (
        <div className="flex flex-col w-full gap-space-xl">
            <div className="flex flex-wrap items-center justify-between gap-space-md">
                <div className="space-y-space-xs">
                    <Heading level={1}>판매글 관리</Heading>
                    <Text color="secondary">등록한 판매글을 확인하고 관리합니다.</Text>
                </div>
                <Button label="판매글 등록" href={ROUTES.sellerProductNew} />
            </div>

            <SellerPostList />
        </div>
    );
}
