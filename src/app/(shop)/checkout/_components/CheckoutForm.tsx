'use client';

import Link from 'next/link';
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { getGetCartQueryKey, useGetCart } from '@/api/generated/cart-controller/cart-controller';
import { useProfile } from '@/api/generated/member-controller/member-controller';
import type { CartItemResponse, SelectSalesPostResponse } from '@/api/generated/model';
import { useCreateDirect, useCreatePersonal } from '@/api/generated/order-controller/order-controller';
import { useSelectSalesPostDetail } from '@/api/generated/sales-post-controller/sales-post-controller';
import { useGetMyWallet } from '@/api/generated/wallet-controller/wallet-controller';
import { ApiError, errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { ROUTES } from '@/lib/routes';
import { formatPrice, toProductOption } from '@/lib/salesPost';
import DeliveryAddressFields, { INPUT_CLASS, deliveryAddressDefaults, deliveryAddressSchema, toDeliveryAddressRequest } from './DeliveryAddressFields';
import Notice from './Notice';
import OrderStatus from './OrderStatus';

const addressSchema = deliveryAddressSchema.extend({
    consent: z.boolean().refine((checked) => checked, '주문 내용 확인에 동의해주세요.'),
});

type AddressInput = z.input<typeof addressSchema>;
type AddressOutput = z.output<typeof addressSchema>;

type CheckoutItem = CartItemResponse & { cartItemId: number };

// 주문서에 보여 줄 상품 한 줄. 장바구니 항목이든 바로 구매 상품이든 같은 모양으로 그린다
type CheckoutLine = { key: string; productName: string; optionName?: string; price: number; quantity: number };

// 주문 만들기: 장바구니 주문과 바로 구매가 다른 API를 쓰므로 부르는 쪽이 넘긴다
type DeliveryAddressRequest = ReturnType<typeof toDeliveryAddressRequest>;
type OrderSubmit = {
    submit: (address: DeliveryAddressRequest) => void;
    isPending: boolean;
    isSuccess: boolean;
    isError: boolean;
    error: unknown;
};

// 장바구니에서 고른 항목(?items=1,2) 또는 바로 구매(?buyNow=재고&qty=수량&post=판매글)로 개인 주문을 만든다.
// 주문을 만들면 주소를 ?order=주문id 로 바꿔 접수 화면을 보여 준다. 새로고침·뒤로 가기 후에도 접수된 주문을 다시 보여 주어
// 같은 항목으로 주문을 또 만드는 일을 줄인다. (BE는 같은 장바구니 항목의 중복 주문을 막지 않는다)
// 주문을 만들면 결제 기한(30분) 안에 접수 화면에서 예치금으로 결제한다.
export default function CheckoutForm() {
    const searchParams = useSearchParams();
    const orderId = Number(searchParams.get('order'));
    if (Number.isInteger(orderId) && orderId > 0) return <OrderStatus orderId={orderId} />;
    const buyNow = readBuyNow(searchParams);
    if (buyNow) return <BuyNowItems {...buyNow} />;
    return <CartItems itemsParam={searchParams.get('items') ?? ''} />;
}

function CartItems({ itemsParam }: { itemsParam: string }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const createOrder = useCreatePersonal({
        mutation: {
            onSuccess: (res) => {
                void queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
                if (res.data?.orderId !== undefined) router.replace(`${ROUTES.checkout}?order=${res.data.orderId}`);
            },
        },
    });
    const ids = new Set(
        itemsParam
            .split(',')
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0),
    );

    const cart = useGetCart();

    if (cart.isPending) return <div className="h-64 bg-surface-container-low animate-pulse" aria-hidden />;
    if (cart.isError && !cart.data) {
        return <Notice message={errorMessage(cart.error, '주문할 상품을 불러오지 못했습니다.')} />;
    }

    // 장바구니에서 사라졌거나 구매할 수 없게 된 항목은 주문에서 뺀다.
    const items = (cart.data?.data?.items ?? []).filter(
        (item): item is CheckoutItem => typeof item.cartItemId === 'number' && ids.has(item.cartItemId) && item.purchasable !== false,
    );
    if (items.length === 0) return <Notice message="주문할 상품이 없습니다. 장바구니에서 상품을 선택해주세요." />;

    return (
        <>
            {items.length < ids.size && (
                <Text display="block" as="p" className="mb-4 rounded-lg bg-surface-container-low p-3" role="status">
                    선택한 상품 중 장바구니에 없거나 구매할 수 없는 상품은 주문에서 제외했습니다.
                </Text>
            )}
            <CheckoutContent
                lines={items.map((item) => ({
                    key: `cart-${item.cartItemId}`,
                    productName: item.productName ?? '',
                    optionName: item.optionName,
                    price: item.price ?? 0,
                    quantity: item.quantity ?? 0,
                }))}
                order={{
                    submit: (address) =>
                        createOrder.mutate({ data: { cartItemIds: items.map((item) => item.cartItemId), deliveryAddress: address } }),
                    ...orderStatus(createOrder),
                }}
            />
        </>
    );
}

type BuyNowParams = { postId: number; inventoryId: number; quantity: number };

function readBuyNow(params: ReadonlyURLSearchParams): BuyNowParams | null {
    const inventoryId = Number(params.get('buyNow'));
    const quantity = Number(params.get('qty'));
    const postId = Number(params.get('post'));
    if (![inventoryId, quantity, postId].every((n) => Number.isInteger(n) && n > 0)) return null;
    return { postId, inventoryId, quantity };
}

// 바로 구매: 장바구니를 거치지 않는다. 상품 상세와 같은 판매글 조회에서 고른 재고의 이름 · 옵션 · 가격을 찾아 보여 주고,
// 배송지를 받으면 바로 주문을 만든다. 결제해도 장바구니는 바뀌지 않는다
function BuyNowItems({ postId, inventoryId, quantity }: BuyNowParams) {
    const router = useRouter();
    const createOrder = useCreateDirect({
        mutation: {
            onSuccess: (res) => {
                if (res.data?.orderId !== undefined) router.replace(`${ROUTES.checkout}?order=${res.data.orderId}`);
            },
        },
    });
    // 남은 수량을 지금 값으로 확인하려고 들어올 때마다 다시 받는다
    const post = useSelectSalesPostDetail(postId, { query: { staleTime: 0 } });

    if (post.isPending) return <div className="h-64 bg-surface-container-low animate-pulse" aria-hidden />;
    if (post.isError && !post.data) {
        return <Notice message={errorMessage(post.error, '주문할 상품을 불러오지 못했습니다.')} />;
    }
    const found = findBuyNowItem(post.data?.data, inventoryId);
    if (!found) return <Notice message="주문할 상품을 찾지 못했습니다. 상품 상세에서 다시 골라 주세요." />;
    if (!found.onSale || found.available < quantity) {
        return <Notice message="지금은 이 수량으로 구매할 수 없습니다. 상품 상세에서 남은 수량을 확인해 주세요." />;
    }

    return (
        <CheckoutContent
            lines={[{ key: `buy-now-${inventoryId}`, productName: found.productName, optionName: found.optionName, price: found.price, quantity }]}
            order={{
                submit: (address) => createOrder.mutate({ data: { inventoryId, quantity, deliveryAddress: address } }),
                ...orderStatus(createOrder),
            }}
        />
    );
}

// 판매글의 상품들에서 재고를 찾는다. 판매글과 상품이 모두 판매 중이어야 살 수 있다
function findBuyNowItem(post: SelectSalesPostResponse | undefined, inventoryId: number) {
    for (const product of (post?.productList ?? []).map(toProductOption)) {
        const inventory = product?.inventories.find((inv) => inv.inventoryId === inventoryId);
        if (product && inventory) {
            return {
                productName: product.name,
                optionName: inventory.skuName,
                price: inventory.price,
                available: inventory.available,
                onSale: post?.status === 'ON_SALE' && product.onSale,
            };
        }
    }
    return null;
}

function orderStatus(mutation: { isPending: boolean; isSuccess: boolean; isError: boolean; error: unknown }) {
    return { isPending: mutation.isPending, isSuccess: mutation.isSuccess, isError: mutation.isError, error: mutation.error };
}

type ContentProps = { lines: CheckoutLine[]; order: OrderSubmit };

// 회원 정보(연락처·기본 배송지)를 받은 뒤 그 값으로 배송지 칸을 채운 채 폼을 연다.
// 회원 정보를 못 받아도 빈 폼으로 주문할 수 있게 한다.
function CheckoutContent(props: ContentProps) {
    const profile = useProfile();
    if (profile.isPending) return <div className="h-64 bg-surface-container-low animate-pulse" aria-hidden />;

    const defaults: AddressInput = { ...deliveryAddressDefaults(profile.data?.data), consent: false };
    return <OrderForm {...props} defaults={defaults} />;
}

function OrderForm({ lines, order, defaults }: ContentProps & { defaults: AddressInput }) {
    const wallet = useGetMyWallet();

    const form = useForm<AddressInput, unknown, AddressOutput>({
        resolver: zodResolver(addressSchema),
        defaultValues: defaults,
    });
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = form;

    const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const balance = wallet.data?.data?.balance;

    const onSubmit = (values: AddressOutput) => {
        // 검증이 비동기라 버튼이 비활성되기 전에 두 번 제출될 수 있어 한 번 더 막는다.
        if (order.isPending || order.isSuccess) return;
        order.submit(toDeliveryAddressRequest(values));
    };

    return (
        <form className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="lg:col-span-8 flex flex-col gap-space-xl">
                <Card className="flex flex-col gap-space-md">
                    <SectionTitle icon="local_shipping" title="배송지 정보" />
                    {/* 배송지 칸은 주문서마다 같은 컴포넌트를 쓰고, 폼 값은 컨텍스트로 넘긴다 */}
                    <FormProvider {...form}>
                        <DeliveryAddressFields />
                    </FormProvider>
                    <div className="flex flex-col gap-space-xs">
                        <label className="font-body-sm text-body-sm text-on-surface-variant" htmlFor="shipping-memo">
                            배송 요청사항 <span className="text-outline">(준비 중)</span>
                        </label>
                        <select id="shipping-memo" className={`${INPUT_CLASS} disabled:opacity-50 disabled:cursor-not-allowed`} disabled>
                            <option>문 앞 배치 (부재 시 문 앞에 놓아주세요)</option>
                        </select>
                    </div>
                </Card>

                <Card className="flex flex-col gap-space-md">
                    <div className="flex items-center justify-between">
                        <SectionTitle icon="inventory_2" title="주문 상품 정보" />
                        <Badge label={`총 ${lines.length}개 품목`} variant="neutral" />
                    </div>
                    <ul className="flex flex-col divide-y divide-surface-container">
                        {lines.map((line) => (
                            <li key={line.key} className="py-space-sm flex items-center justify-between gap-space-md">
                                <div className="min-w-0">
                                    <div className="font-body-md text-body-md font-semibold text-on-surface truncate">{line.productName}</div>
                                    <div className="font-caption text-caption text-secondary">
                                        {line.optionName && `옵션: ${line.optionName} · `}수량: {line.quantity}
                                    </div>
                                </div>
                                <span className="font-label-md text-label-md text-on-surface font-bold shrink-0">
                                    {formatPrice(line.price * line.quantity)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </Card>

                <Card variant="muted" className="flex flex-col gap-space-sm">
                    <SectionTitle icon="payments" title="결제 수단" />
                    <Text as="p" weight="semibold">팀바이 예치금</Text>
                    <Text as="p" type="supporting" color="secondary">주문을 만든 뒤 결제 기한 안에 예치금으로 결제합니다.</Text>
                </Card>
            </div>

            <Card className="lg:col-span-4 lg:sticky lg:top-36 flex flex-col gap-space-md" variant="blue">
                <Heading level={2}>결제 예정 금액</Heading>
                <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
                    <span>주문 상품 총액</span>
                    <span className="text-on-surface font-medium">{formatPrice(total)}</span>
                </div>
                <div className="flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
                    <span>배송비</span>
                    <span className="text-outline">주문 확정 시 안내</span>
                </div>
                <div className="py-space-sm border-t border-b border-outline-variant flex items-center justify-between">
                    <span className="font-label-md text-label-md text-on-surface font-bold">총 주문 금액</span>
                    <span className="font-headline-md text-headline-md text-primary font-bold">{formatPrice(total)}</span>
                </div>
                {balance !== undefined && (
                    <div className="flex flex-col gap-space-xs font-body-sm text-body-sm text-on-surface-variant">
                        <div className="flex items-center justify-between">
                            <span>보유 예치금</span>
                            <span className="text-on-surface">{formatPrice(balance)}</span>
                        </div>
                        <div className={`p-space-xs text-center font-caption text-caption ${balance >= total ? 'bg-surface-container text-on-surface' : 'bg-error-container text-on-error-container'}`}>
                            {balance >= total ? '결제 후 잔액: ' + formatPrice(balance - total) : `예치금이 ${formatPrice(total - balance)} 부족합니다. 결제 전에 충전해주세요.`}
                        </div>
                    </div>
                )}
                <label className="flex items-start gap-space-xs cursor-pointer select-none">
                    <input className="w-4 h-4 mt-0.5 accent-primary" type="checkbox" {...register('consent')} />
                    <span className="font-caption text-caption text-secondary">주문 상품, 배송지, 주문 금액을 확인했습니다.</span>
                </label>
                {errors.consent && <p className="font-caption text-caption text-error">{errors.consent.message}</p>}
                {order.isError && (
                    <div className="flex flex-col gap-space-xs" role="alert">
                        <p className="font-body-sm text-body-sm text-error">{errorMessage(order.error, '주문을 만들지 못했습니다.')}</p>
                        {/* 같은 상품이 든 결제 대기 주문이 있으면 그 주문을 먼저 결제하거나 취소해야 한다 */}
                        {order.error instanceof ApiError && order.error.resultCode?.endsWith('ORDER_ALREADY_PENDING') && (
                            <Link className="font-caption text-caption text-primary underline underline-offset-2" href={ROUTES.orders}>
                                주문 내역에서 결제하거나 취소해 주세요
                            </Link>
                        )}
                    </div>
                )}
                <Button
                    label={order.isPending ? '주문 중...' : `${formatPrice(total)} 주문하기`}
                    className="w-full"
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={order.isPending}
                    isDisabled={order.isPending || order.isSuccess}
                />
            </Card>
        </form>
    );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
    return (
        <div className="flex items-center gap-space-sm">
            <Icon name={icon} className="text-[20px] text-primary" />
            <Heading level={2}>{title}</Heading>
        </div>
    );
}
