import { NextResponse, type NextRequest } from 'next/server';
import { ROLE_REFRESHED_PARAM, ROUTES } from '@/lib/routes';
import { ACCESS_TOKEN_COOKIE, readSession, type Role } from '@/lib/session';

// 페이지 접근 제어. BE SecurityConfig 의 인증 필요 API와 맞춘다.
// 쿠키만 보고 판단하는 사전 차단이며, 실제 권한 검사는 BE가 API마다 한다.
// 로그인 사용자를 로그인 화면에서 내보내는 처리는 여기서 하지 않는다 (RedirectIfLoggedIn 참고).
// roles 가 있으면 그 권한만 허용하고, 아니면 deniedTo 로 보낸다.
type Rule = { prefix: string; roles?: readonly Role[]; deniedTo?: string };

const RULES: readonly Rule[] = [
    { prefix: ROUTES.admin, roles: ['ADMIN'], deniedTo: ROUTES.home },
    { prefix: ROUTES.seller, roles: ['SELLER', 'ADMIN'], deniedTo: ROUTES.sellerApply },
    { prefix: ROUTES.myPage },
    { prefix: ROUTES.cart },
    { prefix: ROUTES.checkout },
    { prefix: ROUTES.groupPurchases },
    { prefix: ROUTES.inquiries },
    { prefix: ROUTES.admin, roles: ['ADMIN'], deniedTo: ROUTES.home },
    { prefix: ROUTES.otpSetup, roles: ['ADMIN'], deniedTo: ROUTES.home }, // 관리자 OTP 등록 (등록 전 세션도 역할은 ADMIN)
    { prefix: ROUTES.seller, roles: ['SELLER', 'ADMIN'], deniedTo: ROUTES.sellerApply },
];

function matches(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function proxy(request: NextRequest) {
    const { pathname, search } = request.nextUrl;
    const session = readSession(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value);

    const rule = RULES.find((r) => matches(pathname, r.prefix));
    if (!rule) return NextResponse.next();

    if (!session) {
        const loginUrl = new URL(ROUTES.login, request.url);
        loginUrl.searchParams.set('next', `${pathname}${search}`);
        return NextResponse.redirect(loginUrl);
    }

    if (rule.roles && !rule.roles.includes(session.role)) {
        const denied = new URL(rule.deniedTo ?? ROUTES.home, request.url);
        // 판매자 센터: 다른 기기에서 판매자로 등록했으면 이 브라우저의 토큰만 예전 역할일 수 있다.
        // 등록 화면이 이미 판매자인지 확인해 토큰을 다시 받고 원래 주소로 돌려보낼 수 있게, 가려던 주소를 싣는다.
        // 한 번 돌려보낸 주소(roleRefreshed)가 또 막히면 싣지 않아 반복을 끊는다
        if (rule.deniedTo === ROUTES.sellerApply && !request.nextUrl.searchParams.has(ROLE_REFRESHED_PARAM)) {
            denied.searchParams.set('next', `${pathname}${search}`);
        }
        return NextResponse.redirect(denied);
    }

    return NextResponse.next();
}

export const config = {
    // API 프록시(/api), Next 내부 파일, 정적 파일은 검사하지 않는다.
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js)$).*)'],
};
