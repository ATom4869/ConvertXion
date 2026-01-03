import Header from "./Header";
import Footer from "./Footer";

const Layout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-grow mt-16 mb-16">{children}</main> {/* Adjust for header/footer space */}
            <Footer />
        </div>
    );
};

export default Layout;
