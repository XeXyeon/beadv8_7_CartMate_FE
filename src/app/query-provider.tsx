'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { logout } from '@/api/generated/auth-controller/auth-controller';
import { ApiError } from '@/api/http';
import { clearCurrentUser, hasCurrentUser } from '@/lib/auth';
import { ROUTES } from '@/lib/routes';

export default function QueryProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    // 요청마다 새 클라이언트가 생기지 않도록 컴포넌트 수명 동안 하나만 만든다.
    const [queryClient] = useState(() => {
        // 요청이 401을 받으면 http()가 /api/auth/refresh로 한 번 재발급을 시도하고, 그래도 401이면 여기로 온다.
        // 재발급까지 실패한 것이므로(리프레시 토큰 만료 · 로그아웃됨) 다시 로그인시킨다.
        const handleError = (error: Error, meta?: Record<string, unknown>) => {
            if (meta?.skipAuthExpired) return;
            if (!(error instanceof ApiError) || error.status !== 401 || !hasCurrentUser(client)) return;
            clearCurrentUser(client);
            const next = `${window.location.pathname}${window.location.search}`;
            // 만료된 쿠키가 남아 있으면 proxy가 로그인 상태로 오인하므로 BE 로그아웃으로 지운 뒤 이동한다.
            // BE가 응답하지 않아도 3초 뒤에는 이동하도록 시간 제한을 둔다.
            void logout({ signal: AbortSignal.timeout(3000) })
                .catch(() => undefined)
                .finally(() => router.replace(`${ROUTES.login}?expired=1&next=${encodeURIComponent(next)}`));
        };

        const client: QueryClient = new QueryClient({
            queryCache: new QueryCache({ onError: (error, query) => handleError(error, query.meta) }),
            mutationCache: new MutationCache({
                onError: (error, _variables, _context, mutation) => handleError(error, mutation.meta),
            }),
            defaultOptions: {
                queries: {
                    staleTime: 60 * 1000,
                    // 4xx(인증·권한·검증 오류)는 다시 보내도 결과가 같으므로 재시도하지 않는다.
                    retry: (failureCount, error) => {
                        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
                            return false;
                        }
                        return failureCount < 1;
                    },
                },
            },
        });
        return client;
    });

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
