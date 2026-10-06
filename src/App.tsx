import { HeroUIProvider } from "@heroui/react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Root from "./routes/root.tsx";
import Index from "./routes";
import Map from "./routes/map_openlayers.tsx";
import Photo from "./routes/photo.tsx";
import Prefecture from "./routes/prefecture.tsx";
import Mapkit from "./routes/cluster.tsx";
import Upload from "./routes/upload.tsx";
import { AdminSessionProvider } from "./contexts/admin_session.tsx";
import "./App.css"


function App() {
  const navigate = useNavigate();

  return (
    <HeroUIProvider navigate={navigate}>
      <AdminSessionProvider>
      <Routes>
        <Route path="/" element={<Root/>}>
          <Route path="" element={<Index/>}/>
          <Route path="map" element={<Map/>}/>
          <Route path="cluster" element={<Mapkit/>}/>
          <Route path="photo/:id" element={<Photo/>}/>
          <Route path="upload" element={<Upload/>}/>
          <Route path="prefecture/:prefectureId" element={<Prefecture/>}/>
          <Route path="prefecture/:prefectureId/city/:cityId" element={<Prefecture/>}/>
          {/* 旧功能链接等未知路径回到首页，避免留下空白页面。 */}
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Route>
      </Routes>
      </AdminSessionProvider>
    </HeroUIProvider>
  )
}

export default App
