import type { Metadata } from 'next';
import AdminCouponManager from './_components/AdminCouponManager';

export const metadata: Metadata = { title: '쿠폰 관리 | TEAMBUY 관리자' };

export default function AdminCouponsPage() {
    return <AdminCouponManager />;
}
