import "./style.css";
export const metadata = {
  title: "Channel Digest — Find your next rabbit hole",
  description:
    "Your interests. The right channels. Just the moments that matter.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
