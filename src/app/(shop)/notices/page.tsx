import type { Metadata } from 'next';
import { ROUTES } from '@/lib/routes';
import { SITE_NAME, pageMetadata } from '@/lib/seo';
import NoticeBoard from './_components/NoticeBoard';

// 로그인 없이 보이는 공개 화면이라 검색 · 공유용 정보를 다른 공개 화면과 같게 준다. (OPS-11)
export const metadata: Metadata = pageMetadata({
    title: `공지사항 | ${SITE_NAME}`,
    description: `${SITE_NAME} 공지사항입니다. 서비스 점검 · 기능 안내, 이벤트 · 혜택, 장애 안내를 확인하세요.`,
    path: ROUTES.notices,
});

export default function NoticesPage() {
    return (
        <div className="flex flex-col w-full max-w-[1200px] mx-auto px-gutter py-space-xl">
            <NoticeBoard />
        </div>
    );
}