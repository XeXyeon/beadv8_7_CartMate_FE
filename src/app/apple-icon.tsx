import { ImageResponse } from 'next/og';
import { BRAND_COLOR, BRAND_ON_COLOR } from '@/lib/seo';

// iOS 홈 화면 아이콘. iOS가 모서리를 둥글게 깎으므로 꽉 채운 사각형으로 만든다. (OPS-7)
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: BRAND_COLOR,
                    color: BRAND_ON_COLOR,
                    fontSize: 120,
                    fontWeight: 800,
                }}
            >
                T
            </div>
        ),
        size,
    );
}
