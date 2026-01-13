import { Card, CardBody } from "@heroui/react";

export default function ComparePage() {
    return (
        <div className="scrollbar-hide px-[10px] md:px-[20px] box-content pt-4 pb-12">
            <div className="text-5xl mb-8 md:mb-12 ml-2 pt-2">
                Compare
            </div>

            <Card>
                <CardBody>
                    <p className="text-default-500">
                        This is the Compare page. You can add your comparison tools or data here later.
                    </p>
                </CardBody>
            </Card>
        </div>
    );
}