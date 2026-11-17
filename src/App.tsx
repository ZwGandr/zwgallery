import { HeroUIProvider } from "@heroui/react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import Root from "./routes/root.tsx";
import Index from "./routes";
import Map from "./routes/map_openlayers.tsx";
import Photo from "./routes/photo.tsx";
import Upload from "./routes/upload.tsx";
import EditPage from "./routes/edit.tsx";
import { AdminSessionProvider } from "./contexts/admin_session.tsx";
import "./App.css"

function LegacyPrefectureRoute() {
  const { prefectureId, cityId } = useParams();
  return <Navigate replace to={`/map/prefecture/${prefectureId}${cityId ? `/city/${cityId}` : ''}`}/>;
}

function App() {
  const navigate = useNavigate();

  return (
    <HeroUIProvider navigate={navigate}>
      <AdminSessionProvider>
      <Routes>
        <Route path="/" element={<Root/>}>
          <Route path="" element={<Index/>}/>
          <Route path="map" element={<Map/>}>
            <Route path="prefecture/:prefectureId/city/:cityId"/>
            <Route path="prefecture/:prefectureId"/>
          </Route>
          <Route path="cluster" element={<Navigate to="/map" replace/>}/>
          <Route path="photo/:id" element={<Photo/>}/>
          <Route path="upload" element={<Upload/>}/>
          <Route path="edit" element={<EditPage/>}/>
          <Route path="prefecture/:prefectureId" element={<LegacyPrefectureRoute/>}/>
          <Route path="prefecture/:prefectureId/city/:cityId" element={<LegacyPrefectureRoute/>}/>
          {/* 旧功能链接等未知路径回到首页，避免留下空白页面。 */}
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Route>
      </Routes>
      </AdminSessionProvider>
    </HeroUIProvider>
  )
}

export default App
