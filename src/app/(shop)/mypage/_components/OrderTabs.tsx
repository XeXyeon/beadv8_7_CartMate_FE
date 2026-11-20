import { Button } from '@astryxdesign/core/Button';
import Icon from '@/components/ui/Icon';
import { ROUTES } from '@/lib/routes';

export type OrderTab = 'orders' | 'deliveries' | 'claims';

const TABS: { key: OrderTab; label: string; href: string; icon?: string }[] = [
    { key: 'orders', label: '주문 내역', href: ROUTES.orders },
    { key: 'claims', label: '교환·환불', href: ROUTES.myClaims, icon: 'sync_alt' },
    { key: 'deliveries', label: '배송 조회', href: ROUTES.deliveries, icon: 'local_shipping' },
];

// 마이페이지 "주문/배송 조회" 아래 세 화면(주문 내역 · 교환·환불 내역 · 배송 조회)을 오가는 탭.
// 지금 화면의 탭은 눌리지 않게 두고, 나머지는 해당 화면으로 이동한다.
export default function OrderTabs({ active }: { active: OrderTab }) {
    return (
        <nav className="flex flex-wrap gap-space-sm" aria-label="주문 · 배송 · 교환·환불">
            {TABS.map((tab) => {
                const icon = tab.icon ? <Icon name={tab.icon} className="text-[16px]" /> : undefined;
                return tab.key === active ? (
                    <Button key={tab.key} label={tab.label} variant="primary" size="sm" icon={icon} isDisabled aria-current="page" />
                ) : (
                    <Button key={tab.key} label={tab.label} variant="secondary" size="sm" href={tab.href} icon={icon} />
                );
            })}
        </nav>
    );
}
