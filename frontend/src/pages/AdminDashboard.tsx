import DeviceTypeManager from "../devices/DeviceTypeManager";
import DeviceCreator from "../devices/DeviceCreator";

export default function AdminDashboard() {
  return (
    <div className="container">
      <h1>Admin dashboard</h1>
      <DeviceTypeManager />
      <DeviceCreator />
    </div>
  );
}