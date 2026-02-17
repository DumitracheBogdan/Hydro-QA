import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) { return <thead {...props} />; }
export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) { return <tbody {...props} />; }
export function TR(props: React.HTMLAttributes<HTMLTableRowElement>) { return <tr className="border-b" {...props} />; }
export function TH(props: React.ThHTMLAttributes<HTMLTableCellElement>) { return <th className="px-3 py-2 text-left font-medium" {...props} />; }
export function TD(props: React.TdHTMLAttributes<HTMLTableCellElement>) { return <td className="px-3 py-2 align-top" {...props} />; }