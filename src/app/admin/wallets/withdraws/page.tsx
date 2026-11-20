import type { Metadata } from 'next';
import AdminWithdrawManager from './_components/AdminWithdrawManager';

export const metadata: Metadata = { title: '출금 처리 | TEAMBUY 관리자' };

export default function AdminWithdrawsPage() {
    return <AdminWithdrawManager />;
}
