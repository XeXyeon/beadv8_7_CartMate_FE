import type { Metadata } from 'next';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import MyPageShell from '@/components/layout/MyPageShell';
import Icon from '@/components/ui/Icon';
import OrderTabs from '../_components/OrderTabs';
import OrderList from './_components/OrderList';

export const metadata: Metadata = {
    title: '주문 내역 조회 | TEAMBUY',
};

export default function OrdersPage() {
    return (
        <MyPageShell title="주문 내역" description="개인 주문과 공동구매 주문을 한곳에서 확인합니다.">
                    <div className="flex flex-col gap-5">
                        <OrderTabs active="orders" />

                        <OrderList />

                        <Card variant="muted" padding={4}>
                          <div className="flex items-start gap-3">
                            <Icon name="info" className="text-outline text-[20px] mt-0.5" />
                            <div className="flex flex-col gap-1">
                                <Text weight="semibold">주문 취소 안내</Text>
                                <Text type="supporting" color="secondary">주문 취소는 주문 상세에서 할 수 있습니다. 결제 완료 주문은 판매자가 배송 준비를 시작하기 전까지 상품을 골라 취소할 수 있고, 취소한 금액은 예치금으로 환불됩니다.</Text>
                                <Text type="supporting" color="secondary">공동물품 공구 주문은 공동구매 주문 현황에서 처리합니다.</Text>
                            </div>
                          </div>
                        </Card>
                    </div>
        </MyPageShell>
    );
}
