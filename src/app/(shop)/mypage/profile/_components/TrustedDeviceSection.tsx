'use client';

import { Badge, Button, Card, Heading, Text } from '@astryxdesign/core';
import { useQueryClient } from '@tanstack/react-query';
import {
    getTrustedDevicesQueryKey,
    useRevokeAllTrustedDevices,
    useRevokeTrustedDevice,
    useTrustedDevices,
} from '@/api/generated/trusted-device-controller/trusted-device-controller';
import type { TrustedDeviceResponse } from '@/api/generated/model';
import { errorMessage } from '@/api/http';
import Icon from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/format';

// 서버는 User-Agent를 그대로 저장한다 → 화면에는 "Chrome · Windows" 정도로 줄여 보인다
function describeDevice(userAgent?: string): { label: string; mobile: boolean } {
    const ua = userAgent ?? '';
    const browser = /Edg\//.test(ua)
        ? 'Edge'
        : /Whale\//.test(ua)
          ? 'Whale'
          : /SamsungBrowser\//.test(ua)
            ? '삼성 인터넷'
            : /Firefox\//.test(ua)
              ? 'Firefox'
              : /Chrome\//.test(ua)
                ? 'Chrome'
                : /Safari\//.test(ua)
                  ? 'Safari'
                  : null;
    const os = /Windows/.test(ua)
        ? 'Windows'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Android/.test(ua)
            ? 'Android'
            : /Mac OS X/.test(ua)
              ? 'macOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : null;
    const label = [browser, os].filter(Boolean).join(' · ');
    return { label: label || ua || '알 수 없는 기기', mobile: /Mobi|iPhone|Android/.test(ua) };
}

// 로그인 기기 관리: "이 기기 30일 기억"으로 2차 인증을 건너뛰는 기기 목록과 해제
export default function TrustedDeviceSection() {
    const queryClient = useQueryClient();
    const devices = useTrustedDevices({ query: { staleTime: 0 } });
    const list = devices.data?.data ?? [];

    const refresh = () => void queryClient.invalidateQueries({ queryKey: getTrustedDevicesQueryKey() });
    const onError = (e: unknown) => {
        alert(errorMessage(e, '기기를 해제하지 못했습니다.'));
        refresh(); // 다른 탭에서 이미 해제했을 수 있음
    };

    const revoke = useRevokeTrustedDevice({ mutation: { onSuccess: refresh, onError } });
    const revokeAll = useRevokeAllTrustedDevices({ mutation: { onSuccess: refresh, onError } });

    const handleRevoke = (device: TrustedDeviceResponse) => {
        const message = device.current
            ? '지금 사용 중인 이 기기를 해제할까요? 다음 로그인부터 이메일 인증번호를 다시 받습니다.'
            : '이 기기를 해제할까요? 그 기기에서는 다음 로그인부터 이메일 인증번호를 다시 받습니다.';
        if (device.id != null && confirm(message)) revoke.mutate({ deviceId: device.id });
    };

    const handleRevokeAll = () => {
        if (confirm('모든 기기를 해제할까요? 이 기기를 포함해 모든 기기에서 다음 로그인부터 이메일 인증번호를 다시 받습니다.')) {
            revokeAll.mutate();
        }
    };

    const busy = revoke.isPending || revokeAll.isPending;

    return (
        <Card>
            <div className="flex flex-wrap gap-space-sm items-start justify-between mb-space-md">
                <div>
                    <Heading level={3}>로그인 기기 관리</Heading>
                    <Text color="secondary">
                        로그인할 때 &lsquo;이 기기 30일 기억&rsquo;을 선택한 기기입니다. 이 기기들은 30일 동안 이메일 인증번호 없이 로그인합니다.
                    </Text>
                </div>
                {list.length > 0 && (
                    <Button label="모든 기기 해제" variant="secondary" type="button" isDisabled={busy} isLoading={revokeAll.isPending} onClick={handleRevokeAll} />
                )}
            </div>

            {devices.isPending ? (
                <div className="h-20 rounded bg-surface-container animate-pulse" aria-hidden />
            ) : devices.isError ? (
                <p className="font-body-sm text-body-sm text-error">{errorMessage(devices.error, '기기 목록을 불러오지 못했습니다.')}</p>
            ) : list.length === 0 ? (
                <div className="flex items-center gap-space-xs p-space-md border border-outline-variant bg-surface-container-low rounded font-body-sm text-body-sm text-outline">
                    <Icon name="devices" className="text-[18px]" />
                    기억된 기기가 없습니다. 로그인할 때마다 이메일 인증번호를 받습니다.
                </div>
            ) : (
                <ul className="flex flex-col divide-y divide-surface-container border border-outline-variant rounded">
                    {list.map((device) => {
                        const { label, mobile } = describeDevice(device.deviceName);
                        return (
                            <li key={device.id} className="flex flex-wrap items-center justify-between gap-space-sm p-space-md">
                                <div className="flex items-start gap-space-sm min-w-0">
                                    <Icon name={mobile ? 'smartphone' : 'computer'} className="text-[24px] text-outline shrink-0" />
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <div className="flex items-center gap-space-xs">
                                            <span className="font-label-md text-label-md text-on-surface font-semibold truncate" title={device.deviceName}>
                                                {label}
                                            </span>
                                            {device.current && <Badge variant="blue" label="지금 이 기기" />}
                                        </div>
                                        <span className="font-caption text-caption text-outline">
                                            마지막 사용 {formatDateTime(device.lastUsedAt)} · 등록 {formatDateTime(device.registeredAt)} · 만료{' '}
                                            {formatDateTime(device.expiresAt)}
                                        </span>
                                    </div>
                                </div>
                                <Button label="해제" variant="secondary" type="button" isDisabled={busy} onClick={() => handleRevoke(device)} />
                            </li>
                        );
                    })}
                </ul>
            )}

            <p className="flex items-center gap-space-xs mt-space-md font-caption text-caption text-outline">
                <Icon name="info" className="text-[16px]" />
                모르는 기기가 있으면 해제하고 비밀번호를 바꿔 주세요. 비밀번호를 바꾸면 모든 기기가 자동으로 해제됩니다.
            </p>
        </Card>
    );
}
