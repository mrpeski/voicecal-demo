interface WaveformProps {
  active: boolean;
}

export default function Waveform({ active }: WaveformProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        height: 28,
        justifyContent: 'center',
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 3,
            borderRadius: 3,
            background: active ? 'var(--accent)' : 'var(--border2)',
            height: active ? undefined : 4,
            minHeight: 4,
            animation: active
              ? `wave 0.9s ease-in-out ${(i * 0.1).toFixed(1)}s infinite alternate`
              : 'none',
            transition: 'background 0.3s',
          }}
        />
      ))}
    </div>
  );
}
