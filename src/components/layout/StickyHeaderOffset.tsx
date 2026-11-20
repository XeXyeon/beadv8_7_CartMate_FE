'use client';

import { useLayoutEffect, useRef } from 'react';

// 고정(sticky) 헤더의 실제 높이를 <html>의 scroll-padding-top 으로 맞춘다.
// Next는 페이지를 이동할 때 새 페이지 윗부분이 이미 화면 안에 있으면 맨 위로 스크롤하지 않는데,
// 헤더 뒤에 가려진 곳도 '화면 안'으로 쳐서 큰 창에서는 상품 상세 등이 아래로 내려간 채 열렸다.
// scroll-padding-top 을 헤더 높이로 주면 헤더 아래부터를 화면으로 보고 맨 위로 올려 준다. #앵커 이동도 헤더에 가려지지 않는다.
// 헤더 높이는 화면 폭 · 로그인 상태에 따라 달라 직접 잰다.
export default function StickyHeaderOffset() {
    const ref = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        const header = ref.current?.closest('header');
        if (!header) return;
        const root = document.documentElement;
        const update = () => {
            root.style.scrollPaddingTop = `${header.offsetHeight}px`;
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(header);
        return () => {
            observer.disconnect();
            root.style.removeProperty('scroll-padding-top');
        };
    }, []);

    return <span ref={ref} hidden />;
}
