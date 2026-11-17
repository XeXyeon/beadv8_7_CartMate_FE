'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { errorMessage, http, type RsData } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { useCurrentUser, useMySellerId } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { ROUTES } from '@/lib/routes';

// 판매글 댓글. 생성 타입(orval)에 아직 없어 BE 응답(SalesPostCommentResponse · SalesPostReplyResponse)대로 적는다.
// 비밀 댓글 · 삭제된 댓글의 내용은 BE가 "비밀 댓글입니다." · "삭제된 댓글입니다."로 바꿔서 준다.
// isMine은 내가 쓴 살아 있는 글일 때만 true(수정 · 삭제 가능)
type Reply = {
    commentId: number;
    writerNickname: string;
    content: string;
    isSecret: boolean;
    isSellerReply: boolean;
    isEdited: boolean;
    isDeleted: boolean;
    isMine: boolean;
    createdAt: string;
};
type Comment = Omit<Reply, 'isSellerReply'> & { replies: Reply[] };
type CommentPage = { content?: Comment[]; totalElements?: number; totalPages?: number };

const MAX_LENGTH = 500; // BE SalesPostComment.MAX_CONTENT_LENGTH

const commentsUrl = (postId: number) => `/api/sales-posts/${postId}/comments`;
const jsonInit = (method: string, body?: unknown): RequestInit => ({
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
});

function fetchComments(postId: number, page: number): Promise<CommentPage> {
    return http<RsData<CommentPage>>(`${commentsUrl(postId)}?page=${page}`).then((res) => res.data ?? {});
}

type Props = { postId: number; sellerId: number | undefined };

// 상품 상세 아래 댓글 섹션: 목록(원댓글 10개씩 + 답글), 작성(비밀 댓글), 답글, 수정, 삭제
export default function ProductComments({ postId, sellerId }: Props) {
    const { user } = useCurrentUser();
    const { sellerId: mySellerId } = useMySellerId();
    const queryClient = useQueryClient();
    const queryKey = ['sales-post-comments', postId];
    const query = useInfiniteQuery({
        queryKey,
        queryFn: ({ pageParam }) => fetchComments(postId, pageParam),
        initialPageParam: 0,
        getNextPageParam: (last, _all, lastPageParam) =>
            last.totalPages != null && lastPageParam + 1 < last.totalPages ? lastPageParam + 1 : undefined,
    });

    // 쓰기 · 수정 · 삭제 공통: 성공하면 목록을 다시 받고, BE가 거절하면 이유를 alert로 보여 준다
    const write = useMutation({
        mutationFn: ({ url, init }: { url: string; init: RequestInit }) => http<unknown>(url, init),
        onSuccess: () => queryClient.invalidateQueries({ queryKey }),
        onError: (error) => window.alert(errorMessage(error, '댓글을 처리하지 못했습니다.')),
    });
    const run = (url: string, init: RequestInit) => write.mutateAsync({ url, init }).then(() => true, () => false);

    // 답글은 그 판매글의 판매자나 원댓글 작성자만 쓸 수 있다 (BE SalesPostCommentCreateUseCase.createReply)
    // 판매글의 sellerId는 판매자 번호(seller.id)라서 회원 번호(user.id)가 아니라 내 판매자 번호와 비교한다
    const isPostSeller = mySellerId != null && sellerId != null && mySellerId === sellerId;

    const comments = query.data?.pages.flatMap((page) => page.content ?? []) ?? [];
    const total = query.data?.pages[0]?.totalElements ?? 0;

    return (
        <section id="comments" className="mt-12 flex w-full scroll-mt-24 flex-col gap-5" aria-labelledby="product-comments">
            <Heading id="product-comments" level={2}>
                댓글 {total > 0 && <span className="text-on-surface-variant">{total.toLocaleString('ko-KR')}</span>}
            </Heading>

            {user ? (
                <NewCommentForm
                    disabled={write.isPending}
                    onSubmit={(content, isSecret) => run(commentsUrl(postId), jsonInit('POST', { content, isSecret }))}
                />
            ) : (
                <Text color="secondary">
                    <Link className="text-primary hover:underline" href={`${ROUTES.login}?next=${encodeURIComponent(`/products/${postId}`)}`}>
                        로그인
                    </Link>
                    하면 댓글을 쓸 수 있습니다.
                </Text>
            )}

            {query.isPending ? (
                <Text color="secondary">댓글을 불러오는 중…</Text>
            ) : query.isError ? (
                <div className="flex items-center gap-space-sm" role="alert">
                    <Text className="text-error">{errorMessage(query.error, '댓글을 불러오지 못했습니다.')}</Text>
                    <Button label="다시 시도" size="sm" variant="secondary" onClick={() => void query.refetch()} />
                </div>
            ) : comments.length === 0 ? (
                <Text color="secondary">아직 댓글이 없습니다. 궁금한 점을 판매자에게 물어보세요.</Text>
            ) : (
                <Card padding={0}>
                    <ul className="divide-y divide-outline-variant">
                        {comments.map((comment) => (
                            <CommentItem
                                key={comment.commentId}
                                comment={comment}
                                canReply={!comment.isDeleted && (isPostSeller || comment.isMine)}
                                busy={write.isPending}
                                onReply={(content) =>
                                    run(`${commentsUrl(postId)}/${comment.commentId}/replies`, jsonInit('POST', { content }))
                                }
                                onEdit={(id, content) => run(`${commentsUrl(postId)}/${id}`, jsonInit('PATCH', { content }))}
                                onDelete={(id) =>
                                    window.confirm('댓글을 삭제할까요? 삭제한 댓글은 되돌릴 수 없습니다.')
                                        ? run(`${commentsUrl(postId)}/${id}`, jsonInit('DELETE'))
                                        : Promise.resolve(false)
                                }
                            />
                        ))}
                    </ul>
                </Card>
            )}

            {query.hasNextPage && (
                <div className="flex justify-center">
                    <Button
                        label={query.isFetchingNextPage ? '불러오는 중…' : '댓글 더 보기'}
                        variant="secondary"
                        isDisabled={query.isFetchingNextPage}
                        onClick={() => void query.fetchNextPage()}
                    />
                </div>
            )}
        </section>
    );
}

// ===== 입력 =====

// 내용 검사(빈 글 · 500자 초과)는 글씨로, 서버 거절은 alert로 (등록 · 수정 화면과 같은 방식)
function validate(content: string): string | null {
    if (content.trim().length === 0) return '내용을 입력해주세요.';
    if (content.length > MAX_LENGTH) return `${MAX_LENGTH}자까지 쓸 수 있습니다.`;
    return null;
}

function TextBox({
    initial = '',
    placeholder,
    submitLabel,
    disabled,
    withSecret = false,
    onSubmit,
    onCancel,
}: {
    initial?: string;
    placeholder: string;
    submitLabel: string;
    disabled: boolean;
    withSecret?: boolean;
    onSubmit: (content: string, isSecret: boolean) => Promise<boolean>;
    onCancel?: () => void;
}) {
    const [content, setContent] = useState(initial);
    const [isSecret, setIsSecret] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    async function submit(event: FormEvent) {
        event.preventDefault();
        const found = validate(content);
        setProblem(found);
        if (found) return;
        const ok = await onSubmit(content.trim(), isSecret);
        if (ok && !onCancel) {
            setContent('');
            setIsSecret(false);
        }
    }

    return (
        <form className="flex flex-col gap-space-xs" onSubmit={submit} noValidate>
            <TextArea
                label={placeholder}
                isLabelHidden
                rows={3}
                maxLength={MAX_LENGTH}
                placeholder={placeholder}
                value={content}
                onChange={(value) => setContent(value)}
            />
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
                <div className="flex items-center gap-space-md">
                    {withSecret && (
                        <CheckboxInput label="비밀 댓글 (판매자와 나만 보기)" size="sm" value={isSecret} onChange={(checked) => setIsSecret(checked)} />
                    )}
                </div>
                <div className="flex gap-space-xs">
                    {onCancel && <Button label="취소" size="sm" variant="ghost" onClick={onCancel} />}
                    <Button label={submitLabel} size="sm" type="submit" isDisabled={disabled} isLoading={disabled} />
                </div>
            </div>
            {problem && <Text className="text-error text-caption">{problem}</Text>}
        </form>
    );
}

function NewCommentForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (content: string, isSecret: boolean) => Promise<boolean> }) {
    return <TextBox placeholder="상품에 대해 궁금한 점을 남겨 주세요." submitLabel="댓글 등록" disabled={disabled} withSecret onSubmit={onSubmit} />;
}

// ===== 목록 =====

type CommentItemProps = {
    comment: Comment;
    canReply: boolean;
    busy: boolean;
    onReply: (content: string) => Promise<boolean>;
    onEdit: (commentId: number, content: string) => Promise<boolean>;
    onDelete: (commentId: number) => Promise<boolean>;
};

function CommentItem({ comment, canReply, busy, onReply, onEdit, onDelete }: CommentItemProps) {
    const [replying, setReplying] = useState(false);

    return (
        <li className="flex flex-col gap-space-sm p-5">
            <Entry entry={comment} busy={busy} onEdit={onEdit} onDelete={onDelete} />
            {canReply && !replying && (
                <div>
                    <Button label="답글" size="sm" variant="ghost" icon={<Icon name="reply" className="text-[16px]" />} onClick={() => setReplying(true)} />
                </div>
            )}

            {(comment.replies.length > 0 || replying) && (
                <div className="ml-space-lg flex flex-col gap-space-sm border-l-2 border-outline-variant pl-space-md">
                    {comment.replies.map((reply) => (
                        <Entry key={reply.commentId} entry={reply} busy={busy} onEdit={onEdit} onDelete={onDelete} />
                    ))}
                    {replying && (
                        <TextBox
                            placeholder="답글을 입력하세요."
                            submitLabel="답글 등록"
                            disabled={busy}
                            onCancel={() => setReplying(false)}
                            onSubmit={async (content) => {
                                const ok = await onReply(content);
                                if (ok) setReplying(false);
                                return ok;
                            }}
                        />
                    )}
                </div>
            )}
        </li>
    );
}

// 원댓글 · 답글 한 줄: 작성자 · 배지 · 날짜 · 내용, 내 글이면 수정 · 삭제
function Entry({
    entry,
    busy,
    onEdit,
    onDelete,
}: {
    entry: Reply | Comment;
    busy: boolean;
    onEdit: (commentId: number, content: string) => Promise<boolean>;
    onDelete: (commentId: number) => Promise<boolean>;
}) {
    const [editing, setEditing] = useState(false);
    const isSellerReply = 'isSellerReply' in entry && entry.isSellerReply;
    const muted = entry.isDeleted || (entry.isSecret && !entry.isMine && entry.content === '비밀 댓글입니다.');

    return (
        <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-space-sm">
                {!entry.isDeleted && <span className="font-body-lg text-body-lg font-semibold text-on-surface">{entry.writerNickname}</span>}
                {isSellerReply && !entry.isDeleted && <Badge label="판매자" variant="blue" />}
                {entry.isSecret && !entry.isDeleted && <Icon name="lock" className="text-[16px] text-on-surface-variant" />}
                {!entry.isDeleted && (
                    <Text type="supporting" color="secondary">
                        {formatDateTime(entry.createdAt)}
                        {entry.isEdited && ' · 수정됨'}
                    </Text>
                )}
                {entry.isMine && !editing && (
                    <div className="ml-auto flex gap-space-xs">
                        <Button label="수정" size="sm" variant="ghost" isDisabled={busy} onClick={() => setEditing(true)} />
                        <Button label="삭제" size="sm" variant="ghost" isDisabled={busy} onClick={() => void onDelete(entry.commentId)} />
                    </div>
                )}
            </div>
            {editing ? (
                <TextBox
                    initial={entry.content}
                    placeholder="내용을 입력하세요."
                    submitLabel="수정 저장"
                    disabled={busy}
                    onCancel={() => setEditing(false)}
                    onSubmit={async (content) => {
                        const ok = await onEdit(entry.commentId, content);
                        if (ok) setEditing(false);
                        return ok;
                    }}
                />
            ) : (
                <Text className={`whitespace-pre-line ${muted ? 'text-on-surface-variant' : ''}`}>{entry.content}</Text>
            )}
        </div>
    );
}
