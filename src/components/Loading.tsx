export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <img src="/logo.png" alt="HP Indigo" className="h-16 w-auto rounded-lg animate-pulse" />
      <span className="text-gray-500 text-sm">טוען...</span>
    </div>
  );
}
