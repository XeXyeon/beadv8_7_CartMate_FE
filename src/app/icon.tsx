import { ImageResponse } from 'next/og';
import { BRAND_COLOR, BRAND_ON_COLOR } from '@/lib/seo';

// 브라우저 탭 아이콘(favicon). 로고 파일이 없어 브랜드 색 + 글자 'T'로 만든다. (OPS-7)
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 7,
                    background: BRAND_COLOR,
                    color: BRAND_ON_COLOR,
                    fontSize: 24,
                    fontWeight: 800,
                }}
            >
                T
            </div>
        ),
        size,
    );
}
