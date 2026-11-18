import Link from 'next/link';
import Icon from '@/components/ui/Icon';

export type NavItem = {
    label: string;
    href: string;
    icon?: string;
    /** 이 메뉴를 활성으로 볼 다른 경로(하위 경로 포함). 예: "주문/배송 조회"는 배송 조회 · 교환·환불 내역에서도 활성 */
    also?: string[];
};

export type NavItemsProps = {
    items: NavItem[];
    /** 하위 경로까지 활성으로 보지 않고 정확히 일치할 때만 활성 처리할 href (예: 대시보드 루트) */
    exactHref?: string;
    className: string;
    activeClassName: string;
    iconClassName?: string;
};

function isActive(pathname: string, href: string, exactHref?: string) {
    if (href === exactHref) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
}

// pathname 이 null 이면 활성 표시 없이 렌더링 (Suspense fallback 용)
export default function NavItems({
    items,
    exactHref,
    className,
    activeClassName,
    iconClassName,
    pathname,
}: NavItemsProps & { pathname: string | null }) {
    // 여러 메뉴가 함께 맞으면(/group-purchases 와 /group-purchases/new) 가장 구체적인 하나만 활성으로 둔다.
    const activeHref =
        pathname === null
            ? undefined
            : items
                  .flatMap((item) =>
                      [item.href, ...(item.also ?? [])]
                          .filter((path) => isActive(pathname, path, exactHref))
                          .map((path) => ({ href: item.href, length: path.length })),
                  )
                  .reduce<{ href: string; length: number } | undefined>((best, match) => (!best || match.length > best.length ? match : best), undefined)?.href;
    return items.map((item) => {
        const active = item.href === activeHref;
        return (
            <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={active ? activeClassName : className}
            >
                {item.icon && <Icon name={item.icon} className={iconClassName} />}
                {item.label}
            </Link>
        );
    });
}
