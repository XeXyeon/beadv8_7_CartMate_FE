'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import Icon from '@/components/ui/Icon';

// BE SalesPostReview.MIN_CONTENT_LENGTH · MAX_CONTENT_LENGTH
export const REVIEW_MIN_LENGTH = 10;
export const REVIEW_MAX_LENGTH = 1000;

// 별 5개 중 rating개를 채운다 (1 ~ 5점)
export function Stars({ rating }: { rating: number }) {
    return (
        <span className="inline-flex items-center" aria-label={`별점 ${rating}점`}>
            {[1, 2, 3, 4, 5].map((n) => (
                <Icon key={n} name="star" filled={n <= rating} className={`text-[18px] ${n <= rating ? 'text-amber-500' : 'text-outline-variant'}`} />
            ))}
        </span>
    );
}

// 내용 검사(별점 안 고름 · 10자 미만 · 1000자 초과)는 글씨로 보여 준다. 서버 거절은 부르는 쪽이 alert로
function validate(rating: number, content: string): string | null {
    if (rating < 1 || rating > 5) return '별점을 골라 주세요.';
    const length = content.trim().length;
    if (length < REVIEW_MIN_LENGTH) return `리뷰 내용을 ${REVIEW_MIN_LENGTH}자 이상 써 주세요.`;
    if (length > REVIEW_MAX_LENGTH) return `${REVIEW_MAX_LENGTH}자까지 쓸 수 있습니다.`;
    return null;
}

type Props = {
    initialRating?: number;
    initialContent?: string;
    submitLabel: string;
    disabled: boolean;
    // 성공하면 true. 실패 이유는 부르는 쪽이 보여 준다
    onSubmit: (rating: number, content: string) => Promise<boolean>;
    onCancel?: () => void;
};

// 리뷰 쓰기 · 수정 공통 입력: 별점(1 ~ 5) + 내용(10 ~ 1000자)
export default function ReviewForm({ initialRating = 0, initialContent = '', submitLabel, disabled, onSubmit, onCancel }: Props) {
    const [rating, setRating] = useState(initialRating);
    const [content, setContent] = useState(initialContent);
    const [problem, setProblem] = useState<string | null>(null);

    async function submit(event: FormEvent) {
        event.preventDefault();
        const found = validate(rating, content);
        setProblem(found);
        if (found) return;
        await onSubmit(rating, content.trim());
    }

    return (
        <form className="flex flex-col gap-space-sm" onSubmit={submit} noValidate>
            <div className="flex items-center gap-space-sm">
                <Text type="supporting" weight="semibold">별점</Text>
                <div className="inline-flex items-center" role="radiogroup" aria-label="별점">
                    {[1, 2, 3, 4, 5].map((n) => (
                        <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={rating === n}
                            aria-label={`${n}점`}
                            className="flex h-10 w-10 items-center justify-center"
                            disabled={disabled}
                            onClick={() => setRating(n)}
                        >
                            <Icon name="star" filled={n <= rating} className={`text-[26px] ${n <= rating ? 'text-amber-500' : 'text-outline-variant'}`} />
                        </button>
                    ))}
                </div>
                {rating > 0 && <Text type="supporting" color="secondary">{rating}점</Text>}
            </div>
            <TextArea
                label="리뷰 내용"
                isLabelHidden
                rows={4}
                maxLength={REVIEW_MAX_LENGTH}
                placeholder={`상품은 어떠셨나요? ${REVIEW_MIN_LENGTH}자 이상 써 주세요.`}
                value={content}
                isDisabled={disabled}
                onChange={(value) => setContent(value)}
            />
            <div className="flex justify-end">
                <div className="flex gap-space-xs">
                    {onCancel && <Button label="취소" size="sm" variant="ghost" onClick={onCancel} />}
                    <Button label={submitLabel} size="sm" type="submit" isDisabled={disabled} isLoading={disabled} />
                </div>
            </div>
            {problem && <Text className="text-error text-caption">{problem}</Text>}
        </form>
    );
}
