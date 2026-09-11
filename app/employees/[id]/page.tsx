import EmployeeCardClient from "./EmployeeCardClient";

export default async function EmployeeCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmployeeCardClient employmentId={id} />;
}
