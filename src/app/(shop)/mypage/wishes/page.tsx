import type { Metadata } from 'next';
import MyPageShell from '@/components/layout/MyPageShell';
import WishList from './_components/WishList';

export const metadata: Metadata = {
    title: '찜한 상품 | TEAMBUY',
};

export default function MyWishesPage() {
    return (
        <MyPageShell title="찜한 상품" description="상품 상세에서 하트를 눌러 찜한 상품입니다. 최근에 찜한 순서로 보여 드립니다.">
            <WishList />
        </MyPageShell>
    );
}
