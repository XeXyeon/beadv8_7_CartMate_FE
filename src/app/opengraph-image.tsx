import { ImageResponse } from 'next/og';
import { BRAND_COLOR, BRAND_ON_COLOR } from '@/lib/seo';

// 사이트 기본 공유 이미지. 로고 파일이 없어 브랜드 색 + 글자로 만든다. (OPS-4, OPS-7)
// 기본 글꼴에 한글이 없어 영문만 쓴다.
export const alt = 'TEAMBUY - 팀 스포츠 단체복 · 장비 공동구매';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '0 96px',
                    background: BRAND_COLOR,
                    color: BRAND_ON_COLOR,
                }}
            >
                <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4 }}>TEAMBUY</div>
                <div style={{ marginTop: 24, fontSize: 44, opacity: 0.85 }}>Team sportswear &amp; gear, bought together</div>
            </div>
        ),
        size,
    );
}
