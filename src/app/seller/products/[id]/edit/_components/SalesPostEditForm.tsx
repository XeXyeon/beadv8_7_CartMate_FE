'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Card, Heading, Text } from '@astryxdesign/core';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { useCurrentUser } from '@/lib/auth';
import { ROUTES } from '@/lib/routes';
import { imageUrl } from '@/lib/salesPost';
import OptionTable, { inventoryTableProblem } from '../../../new/_components/OptionTable';
import { useProductCategories } from '../../../new/_lib/productOptions';
import {
    activeImages,
    fetchEditSource,
    toInventoryTable,
    toUpdateInventories,
    updateSalesPostMultipart,
    type EditSource,
} from '../_lib/updateSalesPost';

const INPUT_CLASS =
    'h-[42px] px-space-md bg-surface border border-outline-variant rounded text-on-surface placeholder:text-outline focus:border-primary focus:outline-none transition-colors';
const MAX_IMAGES = 5;

// 수정 중 · 복구 중인 판매글은 BE가 수정을 받지 않는다 (SalesPostUpdateStatus.editableStatuses 밖)
const BLOCKED_UPDATE: Record<string, string> = {
    PENDING: '이전 수정이 아직 처리 중입니다. 잠시 후 다시 시도해주세요.',
    RECOVERING: '이전 수정을 되돌리는 중입니다. 잠시 후 다시 시도해주세요.',
};
const BLOCKED_SALE: Record<string, string> = {
    PENDING: '등록이 아직 끝나지 않은 판매글입니다.',
    DELETING: '삭제 중인 판매글입니다.',
};

// 기존 이미지는 id로 유지하고, 새로 고른 이미지는 파일로 올린다. 화면 순서가 그대로 imageSeq가 된다
type EditImage = { kind: 'existing'; id: number; url: string | null } | { kind: 'new'; file: File; preview: string };

// 판매글 수정: 기존 값을 불러와 채우고 PATCH /api/sales-posts로 보낸다
export default function SalesPostEditForm({ postId }: { postId: number }) {
    const { user, isLoading: userLoading } = useCurrentUser();
    // 수정 화면의 원본은 들어올 때 한 번만 받는다. 다른 탭에 다녀오는 등으로 다시 받다가 실패하면
    // 입력 중인 폼이 에러 화면으로 바뀌어 고친 내용이 사라지므로, 자동으로 다시 받지 않는다
    const source = useQuery({
        queryKey: ['seller-post-edit', postId],
        queryFn: () => fetchEditSource(postId),
        enabled: Number.isInteger(postId) && postId > 0,
        staleTime: Infinity,
        gcTime: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    if (userLoading || source.isPending) {
        return <Text color="secondary">판매글을 불러오는 중…</Text>;
    }
    if (!source.data) {
        return <Text className="text-error" role="alert">{errorMessage(source.error, '판매글을 불러오지 못했습니다.')}</Text>;
    }
    const { post } = source.data;
    if (user?.id == null || user.id !== post.sellerId) {
        return <Text className="text-error" role="alert">본인이 등록한 판매글만 수정할 수 있습니다.</Text>;
    }
    const blocked = BLOCKED_SALE[post.status] ?? BLOCKED_UPDATE[post.updateStatus ?? ''];
    if (blocked) {
        return (
            <div className="flex flex-col items-start gap-space-md">
                <Text className="text-error" role="alert">{blocked}</Text>
                <Button label="목록으로" href={ROUTES.sellerProducts} variant="secondary" />
            </div>
        );
    }
    // 불러온 값으로 입력칸 · 재고 표 · 이미지의 처음 상태를 만든다
    return <EditFormBody source={source.data} sellerId={user.id} />;
}

function EditFormBody({ source, sellerId }: { source: EditSource; sellerId: number }) {
    const { post, product } = source;
    const { categories, isLoading: categoriesLoading, error: categoriesError } = useProductCategories();
    const [inventoryTable, setInventoryTable] = useState(() => toInventoryTable(product));
    const [images, setImages] = useState<EditImage[]>(() =>
        activeImages(product).map((image) => ({ kind: 'existing', id: image.id, url: imageUrl(image.s3key) })),
    );
    const imagesRef = useRef(images);
    const [formError, setFormError] = useState<string | null>(null);
    const update = useMutation({
        mutationFn: (args: Parameters<typeof updateSalesPostMultipart>) => updateSalesPostMultipart(...args),
    });

    useEffect(() => {
        imagesRef.current = images;
    }, [images]);

    useEffect(() => {
        return () => {
            for (const item of imagesRef.current) if (item.kind === 'new') URL.revokeObjectURL(item.preview);
        };
    }, []);

    function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError(null);

        if (images.length === 0) {
            setFormError('대표 이미지를 1장 이상 등록해주세요.');
            return;
        }

        const form = new FormData(event.currentTarget);
        const title = String(form.get('title') ?? '').trim();
        const content = String(form.get('content') ?? '').trim();
        const categoryId = Number(form.get('categoryId'));
        const name = String(form.get('productName') ?? '').trim();
        const basePrice = Number(form.get('basePrice'));

        if (!title || !name || !Number.isFinite(categoryId) || categoryId <= 0 || !Number.isFinite(basePrice) || basePrice < 0) {
            setFormError('필수 항목을 확인해주세요.');
            return;
        }
        const inventoryProblem = inventoryTableProblem(inventoryTable);
        if (inventoryProblem) {
            setFormError(`옵션 · 재고: ${inventoryProblem}`);
            return;
        }

        update.mutate(
            [
                {
                    id: post.id,
                    sellerId,
                    title,
                    content: content || title,
                    productList: [
                        {
                            id: product.id,
                            categoryId,
                            name,
                            description: content || `${name} 상세 설명`,
                            basePrice,
                            productImageList: images.map((image, index) =>
                                image.kind === 'existing' ? { id: image.id, imageSeq: index + 1 } : { imageSeq: index + 1 },
                            ),
                            inventoryList: toUpdateInventories(inventoryTable),
                        },
                    ],
                },
                // 새 이미지 파일은 productImageList에서 id 없는 항목 순서대로 붙는다
                images.flatMap((image) => (image.kind === 'new' ? [image.file] : [])),
            ],
            {
                onSuccess: () => window.location.assign(ROUTES.sellerProducts),
                // 입력 검사(필수 항목 · 재고 표)는 아래 글씨로, BE가 거절한 이유는 alert 팝업으로 그대로 보여준다
                onError: (error) => window.alert(errorMessage(error, '판매글 수정에 실패했습니다.')),
            },
        );
    }

    function onPickImages(fileList: FileList | null) {
        if (!fileList?.length) return;
        const picked: EditImage[] = Array.from(fileList).map((file) => ({ kind: 'new', file, preview: URL.createObjectURL(file) }));
        setImages((prev) => {
            const next = [...prev, ...picked].slice(0, MAX_IMAGES);
            for (const item of picked) {
                if (!next.includes(item) && item.kind === 'new') URL.revokeObjectURL(item.preview);
            }
            return next;
        });
    }

    function removeImage(index: number) {
        setImages((prev) => {
            const next = [...prev];
            const [removed] = next.splice(index, 1);
            if (removed?.kind === 'new') URL.revokeObjectURL(removed.preview);
            return next;
        });
    }

    return (
        <form className="grid grid-cols-1 lg:grid-cols-3 gap-space-xl" onSubmit={onSubmit} noValidate>
            <div className="lg:col-span-2 space-y-space-xl">
                <Card className="space-y-space-lg" padding={8}>
                    <div className="border-b border-outline-variant/30 pb-space-md">
                        <Heading level={2}>기본 정보</Heading>
                        <Text color="secondary">판매글 제목, 카테고리, 상품명, 기본 가격을 고칩니다.</Text>
                    </div>
                    <div className="space-y-space-lg">
                        <div className="flex flex-col space-y-space-xs">
                            <label className="text-body-sm font-label-sm text-on-surface" htmlFor="edit-title">
                                판매글 제목 <span className="text-error">*</span>
                            </label>
                            <input className={INPUT_CLASS} id="edit-title" name="title" type="text" defaultValue={post.title} required />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                            <div className="flex flex-col space-y-space-xs">
                                <label className="text-body-sm font-label-sm text-on-surface" htmlFor="edit-category">
                                    카테고리 선택 <span className="text-error">*</span>
                                </label>
                                {/* 카테고리 목록이 온 뒤에 그려야 기존 값이 선택된다 */}
                                {categoriesLoading ? (
                                    <select className={`${INPUT_CLASS} disabled:opacity-50`} id="edit-category" disabled>
                                        <option>불러오는 중...</option>
                                    </select>
                                ) : (
                                    <select
                                        className={INPUT_CLASS}
                                        id="edit-category"
                                        name="categoryId"
                                        defaultValue={String(product.categoryId ?? '')}
                                        required
                                    >
                                        <option value="" disabled>
                                            카테고리를 선택하세요
                                        </option>
                                        {categories.map((category) => (
                                            <option key={category.categoryId} value={category.categoryId}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {categoriesError && (
                                    <Text className="text-error" role="alert">
                                        {errorMessage(categoriesError, '카테고리 목록을 불러오지 못했습니다.')}
                                    </Text>
                                )}
                            </div>
                            <div className="flex flex-col space-y-space-xs">
                                <label className="text-body-sm font-label-sm text-on-surface" htmlFor="edit-product-name">
                                    상품명 <span className="text-error">*</span>
                                </label>
                                <input className={INPUT_CLASS} id="edit-product-name" name="productName" type="text" defaultValue={product.name} required />
                            </div>
                        </div>
                        <div className="flex flex-col space-y-space-xs">
                            <label className="text-body-sm font-label-sm text-on-surface" htmlFor="edit-price">
                                기본 가격 (KRW) <span className="text-error">*</span>
                            </label>
                            <div className="relative flex items-center">
                                <input
                                    className={`${INPUT_CLASS} w-full pl-space-md pr-12`}
                                    id="edit-price"
                                    name="basePrice"
                                    type="number"
                                    min={0}
                                    step={1}
                                    defaultValue={product.basePrice}
                                    required
                                />
                                <span className="absolute right-4 text-body-sm text-on-surface-variant font-label-sm">원</span>
                            </div>
                            <Text color="secondary">기본 가격을 바꾸면 모든 옵션 조합의 판매가(기본 가격 + 추가 금액)가 함께 바뀝니다.</Text>
                        </div>
                    </div>
                </Card>

                <Card className="space-y-space-lg" padding={8}>
                    <div className="border-b border-outline-variant/30 pb-space-md">
                        <Heading level={2}>상세 설명</Heading>
                    </div>
                    <textarea
                        className="w-full p-space-md bg-surface border border-outline-variant rounded text-on-surface placeholder:text-outline focus:border-primary focus:outline-none transition-colors resize-y"
                        name="content"
                        placeholder="상세 내용을 입력하세요..."
                        rows={8}
                        defaultValue={post.content}
                    />
                </Card>

                <OptionTable value={inventoryTable} onChange={setInventoryTable} typesLocked />
            </div>

            <div className="space-y-space-xl">
                <Card className="sticky top-24 space-y-space-lg" padding={8}>
                    <div className="border-b border-outline-variant/30 pb-space-md">
                        <Heading level={2}>이미지</Heading>
                        <Text color="secondary">첫 번째 이미지가 대표 이미지입니다. (최대 {MAX_IMAGES}장)</Text>
                    </div>
                    <div className="flex flex-col space-y-space-md">
                        {images.length > 0 && (
                            <ul className="grid grid-cols-4 gap-space-sm">
                                {images.map((item, index) => {
                                    const src = item.kind === 'existing' ? item.url : item.preview;
                                    return (
                                        <li
                                            key={item.kind === 'existing' ? `existing-${item.id}` : `new-${item.preview}`}
                                            className="aspect-square bg-surface border border-outline-variant rounded overflow-hidden relative"
                                        >
                                            {src ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={src} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Icon name="image" className="text-outline text-[18px]" />
                                                </div>
                                            )}
                                            {index === 0 && (
                                                <span className="absolute bottom-0 left-0 right-0 bg-on-surface/70 text-surface text-[10px] text-center">대표</span>
                                            )}
                                            <button
                                                className="absolute top-0.5 right-0.5 z-20 w-5 h-5 rounded-full bg-on-surface/70 text-surface text-[10px] flex items-center justify-center"
                                                type="button"
                                                aria-label="이미지 제거"
                                                onClick={() => removeImage(index)}
                                            >
                                                ×
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {images.length < MAX_IMAGES && (
                            <label
                                htmlFor="edit-images"
                                className="relative w-full border-2 border-dashed border-outline-variant rounded-xl bg-surface flex flex-col items-center justify-center p-space-lg text-center hover:border-primary transition-colors cursor-pointer"
                            >
                                <input
                                    id="edit-images"
                                    className="absolute inset-0 z-10 w-full h-full opacity-0 cursor-pointer"
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => {
                                        onPickImages(e.target.files);
                                        e.target.value = '';
                                    }}
                                />
                                <Icon name="add_a_photo" className="text-[24px] pointer-events-none" />
                                <span className="text-label-md text-on-surface mt-space-xs pointer-events-none">이미지 추가</span>
                            </label>
                        )}
                    </div>
                    {formError && (
                        <Text className="text-error" role="alert">
                            {formError}
                        </Text>
                    )}
                    <div className="pt-space-md border-t border-outline-variant/30 flex flex-col gap-space-sm">
                        <Button
                            className="w-full"
                            label={update.isPending ? '저장 중...' : '수정 저장'}
                            icon={<Icon name="check" className="text-[18px]" />}
                            type="submit"
                            variant="primary"
                            isDisabled={update.isPending}
                        />
                        <Button className="w-full" label="취소" href={ROUTES.sellerProducts} variant="secondary" />
                    </div>
                </Card>
            </div>
        </form>
    );
}
