import type { Metadata } from 'next';
import MyPageShell from '@/components/layout/MyPageShell';
import WritableReviewList from './_components/WritableReviewList';

export const metadata: Metadata = {
    title: '리뷰 쓰기 | TEAMBUY',
};

export default function MyReviewsPage() {
    return (
        <MyPageShell title="리뷰 쓰기" description="구매를 확정한 상품에 리뷰를 남깁니다. 구매확정 후 30일 안에 쓸 수 있습니다.">
            <WritableReviewList />
        </MyPageShell>
    );
}
