'use client';

import Link from 'next/link';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import { LinkProvider } from '@astryxdesign/core/Link';
import { Theme } from '@astryxdesign/core/theme';
import koKR from '@astryxdesign/core/locales/ko-KR.generated.js';
import { teambuyTheme } from '@/theme/teambuy';
import QueryProvider from './query-provider';

// astryx가 함께 주는 ko-KR 카탈로그에 빠진 키 중 이 앱의 컴포넌트가 쓰는 것만 채운다.
// 나머지 빠진 키는 en으로 대체된다.
const KO_OVERRIDES = {
    'ko-KR': {
        '@astryx.field.labelTooltip': '{label} 설명',
        '@astryx.inputClearButton.tooltip': '지우기',
        '@astryx.infoTip.label': '자세히 보기',
        '@astryx.switch.loading': '불러오는 중',
    },
};

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <InternationalizationProvider locale="ko-KR" messages={{ 'ko-KR': koKR }} overrides={KO_OVERRIDES}>
            <Theme theme={teambuyTheme}>
                <LinkProvider component={Link}>
                    <QueryProvider>{children}</QueryProvider>
                </LinkProvider>
            </Theme>
        </InternationalizationProvider>
    );
}
